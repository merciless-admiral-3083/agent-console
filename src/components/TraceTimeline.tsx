'use client';

import { useState, useMemo, useCallback } from 'react';
import { ServerMessage } from '@/types/protocol';

type TraceEvent = ServerMessage & { timestamp: number };

interface TraceTimelineProps {
  events: TraceEvent[];
  onSelect?: (seq: number) => void;
}

export function TraceTimeline({ events, onSelect }: TraceTimelineProps) {
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filteredEvents = useMemo(() => {
    let result = events;

    if (filter !== 'all') {
      result = result.filter(e => e.type === filter);
    }

    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(e => JSON.stringify(e).toLowerCase().includes(lower));
    }

    return result;
  }, [events, filter, search]);

  const eventTypes = useMemo(() => {
    const types = new Set(events.map(e => e.type));
    return ['all', ...Array.from(types)];
  }, [events]);

  const groupTokens = useCallback((events: TraceEvent[]) => {
    const groups: (TraceEvent | { type: 'TOKEN_GROUP'; events: TraceEvent[]; count: number; text: string })[] = [];
    let tokenBuffer: TraceEvent[] = [];

    for (const event of events) {
      if (event.type === 'TOKEN') {
        tokenBuffer.push(event);
      } else {
        if (tokenBuffer.length > 0) {
          groups.push({
            type: 'TOKEN_GROUP',
            events: tokenBuffer,
            count: tokenBuffer.length,
            text: tokenBuffer.map(t => (t as any).text).join(''),
          });
          tokenBuffer = [];
        }
        groups.push(event);
      }
    }

    if (tokenBuffer.length > 0) {
      groups.push({
        type: 'TOKEN_GROUP',
        events: tokenBuffer,
        count: tokenBuffer.length,
        text: tokenBuffer.map(t => (t as any).text).join(''),
      });
    }

    return groups;
  }, []);

  const groupedEvents = useMemo(() => groupTokens(filteredEvents), [filteredEvents, groupTokens]);

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b bg-white">
        <h2 className="font-semibold mb-3">Trace Timeline</h2>
        <div className="space-y-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search events..."
            className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex flex-wrap gap-1">
            {eventTypes.map(type => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`px-2 py-1 text-xs rounded ${filter === type ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {groupedEvents.map((event, idx) => (
          <TraceEventRow
            key={idx}
            event={event}
            index={idx}
            onClick={() => event.type !== 'TOKEN_GROUP' && onSelect?.(event.seq)}
          />
        ))}
      </div>
    </div>
  );
}

function TraceEventRow({ event, index, onClick }: { event: any; index: number; onClick: () => void }) {
  const isGroup = event.type === 'TOKEN_GROUP';
  const [expanded, setExpanded] = useState(false);

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      TOKEN: 'bg-blue-100 text-blue-700',
      TOOL_CALL: 'bg-orange-100 text-orange-700',
      TOOL_RESULT: 'bg-green-100 text-green-700',
      CONTEXT_SNAPSHOT: 'bg-purple-100 text-purple-700',
      PING: 'bg-gray-100 text-gray-700',
      STREAM_END: 'bg-indigo-100 text-indigo-700',
      ERROR: 'bg-red-100 text-red-700',
    };
    return colors[type] || 'bg-gray-100 text-gray-700';
  };

  if (isGroup) {
    return (
      <div className="bg-blue-50 border rounded-lg p-3 cursor-pointer hover:bg-blue-100 transition-colors" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <span className="px-2 py-0.5 text-xs rounded bg-blue-100 text-blue-700">TOKEN x{event.count}</span>
          <span className="text-sm text-gray-600 font-mono">{event.text.slice(0, 80)}{event.text.length > 80 ? '...' : ''}</span>
          <svg className={`w-4 h-4 text-gray-400 ml-auto transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        {expanded && (
          <div className="mt-2 ml-8 space-y-1 border-l-2 border-blue-200 pl-3">
            {event.events.map((e: any, i: number) => (
              <div key={i} className="text-xs text-gray-600 font-mono">#{e.seq}: "{e.text}"</div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const msg = event as TraceEvent;
  const displayContent = () => {
    switch (msg.type) {
      case 'TOOL_CALL':
        return `${msg.tool_name}(${JSON.stringify(msg.args).slice(0, 60)})`;
      case 'TOOL_RESULT':
        return `→ ${JSON.stringify(msg.result).slice(0, 80)}`;
      case 'CONTEXT_SNAPSHOT':
        return `ctx:${msg.context_id} keys:${Object.keys(msg.data).length}`;
      case 'PING':
        return `challenge: ${msg.challenge || '(empty)'}`;
      case 'ERROR':
        return `[${msg.code}] ${msg.message}`;
      case 'STREAM_END':
        return `stream:${msg.stream_id} ended`;
      default:
        return JSON.stringify(msg).slice(0, 100);
    }
  };

  return (
    <div
      className={`border rounded-lg p-3 cursor-pointer hover:bg-gray-50 transition-colors ${getTypeColor(msg.type).replace('bg-', 'border-l-4 ')}`}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <span className={`px-2 py-0.5 text-xs rounded ${getTypeColor(msg.type)} font-mono`}>#{msg.seq}</span>
        <span className={`px-2 py-0.5 text-xs rounded ${getTypeColor(msg.type)}`}>{msg.type}</span>
        <span className="flex-1 text-sm text-gray-700 font-mono">{displayContent()}</span>
        <span className="text-xs text-gray-400">{new Date(msg.timestamp).toLocaleTimeString()}</span>
      </div>
    </div>
  );
}