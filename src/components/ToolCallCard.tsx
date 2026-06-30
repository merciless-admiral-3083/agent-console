'use client';

import { useState } from 'react';

interface ToolCallCardProps {
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: Record<string, unknown>;
  status: 'pending' | 'completed';
}

export function ToolCallCard({ callId, toolName, args, result, status }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-4 py-3 flex items-center gap-3 bg-gray-50 border-b hover:bg-gray-100 transition-colors"
        >
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
          <div className="flex-1 text-left">
            <p className="font-medium text-gray-900">{toolName}</p>
            <p className="text-sm text-gray-500">{status === 'pending' ? 'Executing...' : 'Completed'}</p>
          </div>
          <svg className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {expanded && (
          <div className="p-4 space-y-4 border-t bg-gray-50">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Arguments</p>
              <pre className="bg-gray-900 text-gray-100 p-3 rounded text-xs overflow-x-auto">{JSON.stringify(args, null, 2)}</pre>
            </div>

            {result && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Result</p>
                <pre className="bg-gray-900 text-green-100 p-3 rounded text-xs overflow-x-auto">{JSON.stringify(result, null, 2)}</pre>
              </div>
            )}

            {status === 'pending' && (
              <div className="flex items-center gap-2 text-yellow-600 text-sm">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Waiting for result...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}