'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { wsManager } from '@/lib/websocket';
import { ServerMessage } from '@/types/protocol';
import { ToolCallCard } from './ToolCallCard';
import { TraceTimeline } from './TraceTimeline';
import { ContextInspector } from './ContextInspector';

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [contextSnapshots, setContextSnapshots] = useState<Map<string, ContextSnapshot[]>>(new Map());
  const [currentContextId, setCurrentContextId] = useState<string | null>(null);
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pendingAcks = useRef<Map<string, { callId: string; toolName: string; args: Record<string, unknown> }>>(new Map());

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const unsubscribeMsg = wsManager.onMessage(handleServerMessage);
    const unsubscribeConn = wsManager.onConnectionChange(handleConnectionChange);
    const unsubscribeError = wsManager.onError(handleError);

    wsManager.connect();

    return () => {
      unsubscribeMsg();
      unsubscribeConn();
      unsubscribeError();
      wsManager.disconnect();
    };
  }, []);

  const handleConnectionChange = (isConnected: boolean) => {
    setConnected(isConnected);
    setReconnecting(!isConnected);
  };

  const handleError = (error: Error) => {
    console.error('WS Error:', error);
  };

  const handleServerMessage = (msg: ServerMessage) => {
    setTraceEvents(prev => [...prev, { ...msg, timestamp: Date.now() }]);

    switch (msg.type) {
      case 'TOKEN':
        handleToken(msg);
        break;
      case 'TOOL_CALL':
        handleToolCall(msg);
        break;
      case 'TOOL_RESULT':
        handleToolResult(msg);
        break;
      case 'CONTEXT_SNAPSHOT':
        handleContextSnapshot(msg);
        break;
      case 'PING':
        handlePing(msg);
        break;
      case 'STREAM_END':
        handleStreamEnd(msg);
        break;
      case 'ERROR':
        handleServerError(msg);
        break;
    }
  };

  const handleToken = (msg: ServerMessage & { type: 'TOKEN' }) => {
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'assistant' && !last.toolCall && last.streamId === msg.stream_id) {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...last,
          content: last.content + msg.text,
        };
        return updated;
      }
      return [...prev, {
        id: `msg_${msg.seq}`,
        role: 'assistant',
        content: msg.text,
        streamId: msg.stream_id,
      }];
    });
  };

  const handleToolCall = (msg: ServerMessage & { type: 'TOOL_CALL' }) => {
    pendingAcks.current.set(msg.call_id, {
      callId: msg.call_id,
      toolName: msg.tool_name,
      args: msg.args,
    });

    setMessages(prev => [...prev, {
      id: `msg_${msg.call_id}`,
      role: 'tool_call',
      toolCall: {
        callId: msg.call_id,
        toolName: msg.tool_name,
        args: msg.args,
        status: 'pending',
      },
    }]);

    setTimeout(() => {
      wsManager.sendToolAck(msg.call_id);
    }, 100);
  };

  const handleToolResult = (msg: ServerMessage & { type: 'TOOL_RESULT' }) => {
    const pending = pendingAcks.current.get(msg.call_id);
    if (pending) {
      pendingAcks.current.delete(msg.call_id);
    }

    setMessages(prev => prev.map(m => {
      if (m.role === 'tool_call' && m.toolCall?.callId === msg.call_id) {
        return {
          ...m,
          toolCall: {
            ...m.toolCall!,
            result: msg.result,
            status: 'completed',
          },
        };
      }
      return m;
    }));
  };

  const handleContextSnapshot = (msg: ServerMessage & { type: 'CONTEXT_SNAPSHOT' }) => {
    setContextSnapshots(prev => {
      const newMap = new Map(prev);
      const snapshots = newMap.get(msg.context_id) || [];
      const exists = snapshots.find(s => s.seq === msg.seq);
      if (!exists) {
        newMap.set(msg.context_id, [...snapshots, {
          seq: msg.seq,
          data: msg.data,
          timestamp: Date.now(),
        }].sort((a, b) => a.seq - b.seq));
      }
      return newMap;
    });

    if (!currentContextId) {
      setCurrentContextId(msg.context_id);
    }
  };

  const handlePing = (msg: ServerMessage & { type: 'PING' }) => {
    if (msg.challenge) {
      wsManager.sendPong(msg.challenge);
    }
  };

  const handleStreamEnd = (msg: ServerMessage & { type: 'STREAM_END' }) => {
    // Stream completed
  };

  const handleServerError = (msg: ServerMessage & { type: 'ERROR' }) => {
    setMessages(prev => [...prev, {
      id: `err_${msg.seq}`,
      role: 'error',
      content: `[${msg.code}] ${msg.message}`,
    }]);
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !connected) return;

    setMessages(prev => [...prev, {
      id: `user_${Date.now()}`,
      role: 'user',
      content: input,
    }]);
    wsManager.sendUserMessage(input);
    setInput('');
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b bg-white px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Agent Console</h1>
          <div className="flex items-center gap-4">
            <span className={`flex items-center gap-1.5 text-sm ${connected ? 'text-green-600' : reconnecting ? 'text-yellow-600' : 'text-red-600'}`}>
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : reconnecting ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`} />
              {connected ? 'Connected' : reconnecting ? 'Reconnecting...' : 'Disconnected'}
            </span>
            <button
              onClick={() => setShowTimeline(!showTimeline)}
              className={`px-3 py-1.5 text-sm rounded ${showTimeline ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              Timeline
            </button>
            <button
              onClick={() => setShowContext(!showContext)}
              className={`px-3 py-1.5 text-sm rounded ${showContext ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              Context
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, idx) => (
            <MessageBubble key={msg.id} message={msg} index={idx} />
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={sendMessage} className="border-t bg-white p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={connected ? 'Type a message...' : 'Connecting...'}
              disabled={!connected}
              className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={!connected || !input.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </form>
      </div>

      {showTimeline && (
        <div className="w-96 border-l bg-white">
          <TraceTimeline events={traceEvents} onSelect={(seq) => {
            // Could scroll to message
          }} />
        </div>
      )}

      {showContext && (
        <div className="w-96 border-l bg-white">
          <ContextInspector
            snapshots={contextSnapshots}
            currentContextId={currentContextId}
            onContextChange={setCurrentContextId}
          />
        </div>
      )}
    </div>
  );
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool_call' | 'error';
  content?: string;
  streamId?: string;
  toolCall?: {
    callId: string;
    toolName: string;
    args: Record<string, unknown>;
    result?: Record<string, unknown>;
    status: 'pending' | 'completed';
  };
}

type TraceEvent = ServerMessage & { timestamp: number };

interface ContextSnapshot {
  seq: number;
  data: Record<string, unknown>;
  timestamp: number;
}

function MessageBubble({ message, index }: { message: ChatMessage; index: number }) {
  const isUser = message.role === 'user';
  const isError = message.role === 'error';
  const isToolCall = message.role === 'tool_call';

  if (isToolCall && message.toolCall) {
    return (
      <ToolCallCard
        callId={message.toolCall.callId}
        toolName={message.toolCall.toolName}
        args={message.toolCall.args}
        result={message.toolCall.result}
        status={message.toolCall.status}
      />
    );
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[70%] ${isUser ? 'bg-blue-600 text-white' : isError ? 'bg-red-100 text-red-800' : 'bg-white text-gray-900'} rounded-2xl px-4 py-2 shadow-sm`}>
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}