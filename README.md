# Agent Console

A Next.js 14+ frontend for the Agent Server WebSocket protocol. Handles streaming tokens, tool call interruptions, trace timeline, context inspection with diffing, and chaos mode survival.

## Quick Start

`ash
# Terminal 1: Start the mock agent backend
cd agent-server
npm install
npm run build
npm start              # normal mode on ws://localhost:4747/ws
# or
npm start -- --mode chaos  # chaos mode

# Terminal 2: Start the frontend
cd agent-console
npm install
npm run dev            # runs on http://localhost:3000
`

## Features Implemented

### Task 1: Streaming Chat with Tool Call Interruptions
- Tokens render incrementally as they arrive (30-80ms intervals)
- TOOL_CALL mid-stream freezes the text, renders a tool card, sends TOOL_ACK within 100ms
- TOOL_RESULT updates the card and resumes streaming without duplication
- Sequential tool calls stack correctly

### Task 2: Agent Trace Timeline
- Collapsible side panel with real-time protocol events
- TOKEN events batched into expandable groups ("Streamed 47 tokens (1.2s)")
- TOOL_CALL/TOOL_RESULT visually linked by call_id
- Filter by event type, search by content
- Click any row to highlight in chat (bidirectional)

### Task 3: Context Inspector
- Syntax-highlighted tree view of CONTEXT_SNAPSHOT data
- Diff between consecutive snapshots (added/removed/changed keys)
- History scrubber to step through snapshots
- Handles 500KB+ payloads with lazy expansion (first 100 array items, expandable)

### Task 4: Reconnection with State Recovery
- Exponential backoff: 500ms -> 1s -> 2s -> 4s -> 10s (max 10 attempts)
- On reconnect, sends RESUME with last_seq as first message
- Buffers out-of-order messages, processes in sequence order
- Deduplicates by seq
- Tool cards persist through reconnection with "waiting" state
- Heartbeat: responds to PING with PONG echoing challenge within 3s
- Handles corrupt PING (empty challenge) without crashing

### Task 5: Chaos Mode Survival
- Connection drops: reconnects and continues seamlessly
- Out-of-order: reorder buffer sorts by seq before processing
- Rapid tool calls: both cards render, both results land
- Oversized context: tree view stays responsive (lazy expansion)
- Corrupt heartbeat: empty challenge ignored gracefully

## Architecture

`
src/
lib/
    websocket.ts      # WebSocketManager: connection, reconnection, reorder buffer, heartbeat
types/
    protocol.ts       # Strict TypeScript types for all protocol messages
components/
    ChatPanel.tsx     # Main chat UI, message rendering, WebSocket integration
    ToolCallCard.tsx  # Tool call/result card with expandable args/result
    TraceTimeline.tsx # Virtualized event timeline with filtering/grouping
    ContextInspector.tsx # JSON tree with diff highlighting + history scrubber
app/
    page.tsx          # Client component wrapper
    layout.tsx        # Root layout
    globals.css       # Tailwind v4
`

## State Machine

`
DISCONNECTED
    | connect()
    v
CONNECTING ------------> CONNECTED (normal)
    |                        |
    | reconnect (backoff)    | onMessage()
    |                        v
    |                 STREAMING (tokens flowing)
    |                        |
    |              +---------+---------+
    |              v                   v
    |        TOOL_CALL             PING       STREAM_END
    |              |                   |            |
    |              v                   v            v
    |        TOOL_ACK                PONG         DONE
    |              |                               |
    |              v                               |
    |        TOOL_RESULT                          |
    |              |                               |
    |              v                               |
    +----------> RECONNECTING (on drop)
                    |
                    | RESUME(last_seq)
                    v
               CONNECTED (replay)
                    |
                    v
               STREAMING (resume)
`


## Trigger Keywords

| Keywords | Script | Tests |
|----------|--------|-------|
| hello, hi | Greeting | Basic streaming |
| report, summary, q3 | Report | Tool call mid-stream + context update |
| analyze, compare | Multi-tool | Two sequential tool calls |
| lookup, find, search | Lookup | Tool call before tokens |
| schema, database, large | Large context | 500KB+ snapshot + tool call |
| long, detailed | Long response | Many tokens + tool call |
| (anything else) | Default | Moderate response + tool call |

## Tech Stack

- Next.js 14 (App Router, Turbopack)
- TypeScript strict mode (no any, no @ts-ignore)
- Tailwind CSS v4
- Native WebSocket API (no libraries)

## Known Limitations

- Single session (server limitation)
- No persistence across browser refresh
- Timeline grows unbounded (could add windowing)
- Diff algorithm is shallow (top-level keys only)
