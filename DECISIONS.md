# Design Decisions

## 1. Sequence Number Ordering & Deduplication

**Approach**: Reorder buffer + monotonic lastProcessedSeq

- Every server message has a global seq. Client tracks lastProcessedSeq (highest fully-rendered).
- Incoming messages with seq <= lastProcessedSeq are dropped (dedup).
- Messages with seq > lastProcessedSeq + 1 go into a sorted buffer.
- After processing a message, flush buffer while next sequential exists.

**Why**: Chaos mode delivers out-of-order and duplicates. Map + while-loop flush is O(1) per message amortized. No external deps.

## 2. Preventing Layout Shift During Tool Calls

**Approach**: Freeze the assistant message node, render tool card as sibling

- Assistant message is a single DOM node keyed by stream_id.
- When TOOL_CALL arrives, stop appending to that node.
- Tool card renders as a separate message with ole: 'tool_call'.
- TOOL_RESULT mutates that card in place.
- Streaming resumes by creating a NEW assistant message node with same stream_id.

**CSS**: min-height: 1.5rem prevents collapse. Tool cards use fixed layout.

**Why**: React keys + separate message entries = no reflow of prior text.

## 3. Reconnection State Recovery

**Two-sequence tracking**:
- lastReceivedSeq: highest seq seen on socket (for RESUME)
- lastRenderedSeq: highest seq fully committed to DOM

On reconnect: send RESUME with lastReceivedSeq. Server replays everything after.
Client processes replayed messages through same reorder buffer. Messages with seq <= lastRenderedSeq are no-ops.

Tool calls: if TOOL_CALL replayed but TOOL_RESULT not yet received, card stays in waiting state. When TOOL_RESULT arrives, card updates.

**Why separate sequences?**: Network receives faster than React renders. If we only track rendered, we might RESUME too early.

**Race condition**: TOOL_ACK timeout (5s server-side) vs reconnection. If connection drops after TOOL_CALL but before TOOL_ACK, server times out and sends TOOL_RESULT anyway. On replay, both arrive -- we render card, then result. Works.

## 4. Scaling to 50 Concurrent Streams (Operations Dashboard)

**Changes needed**:
- WebSocket: pool of WebSocketManager instances, each with own lastProcessedSeq
- State: centralized store (Zustand/Redux) with normalized entities
- Rendering: virtualize chat list (react-window). Each stream = collapsible section
- Timeline: global timeline with stream filter. Shared event buffer with streamId tag
- Context: tabbed inspector per contextId
- Performance: debounce timeline updates (batch 50ms). Web Workers for JSON diff

## 5. Scaling to 100x Longer Responses (Document Generation)

**Changes needed**:
- Streaming: don't keep all tokens in React state. Use TransformStream to write to IndexedDB/file, UI reads viewport
- Memory: current approach accumulates full string. For 100k tokens, stream write + viewport read
- Tool calls: same interruption model, but virtualize tool cards too
- Timeline: token groups essential -- never render individual tokens. Batch by time (100ms) or count (100)
- Context: diffing 500KB repeatedly is slow. Use structural sharing (Immer) or Web Worker

## Protocol Gap Found

**TOOL_ACK race**: Server waits 5s for TOOL_ACK before sending TOOL_RESULT anyway. If client sends TOOL_ACK at 4.9s but network delays it, server may have already sent TOOL_RESULT. Client receives TOOL_RESULT before TOOL_ACK acknowledged -- but since we render card on TOOL_CALL immediately and update on TOOL_RESULT, this is harmless. The TOOL_ACK is purely for server logging.

**Missing**: No TOOL_ERROR message type. If tool execution fails, server still sends TOOL_RESULT with error payload. Client can't distinguish success/failure without inspecting result schema.

**Suggestion**: Add TOOL_ERROR with rror: { code, message } for explicit handling.
