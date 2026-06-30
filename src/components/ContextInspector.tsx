'use client';

import { useState, useMemo } from 'react';

interface ContextSnapshot {
  seq: number;
  data: Record<string, unknown>;
  timestamp: number;
}

interface ContextInspectorProps {
  snapshots: Map<string, ContextSnapshot[]>;
  currentContextId: string | null;
  onContextChange: (id: string | null) => void;
}

export function ContextInspector({ snapshots, currentContextId, onContextChange }: ContextInspectorProps) {
  const [historyIndex, setHistoryIndex] = useState(0);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set(['root']));

  const contextIds = useMemo(() => Array.from(snapshots.keys()), [snapshots]);
  const currentSnapshots = currentContextId ? snapshots.get(currentContextId) || [] : [];
  const currentSnapshot = currentSnapshots[historyIndex];
  const prevSnapshot = historyIndex > 0 ? currentSnapshots[historyIndex - 1] : null;

  const toggleKey = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const computeDiff = (prev: Record<string, unknown> | null, curr: Record<string, unknown>) => {
    const changes: DiffEntry[] = [];
    const allKeys = new Set([...Object.keys(prev || {}), ...Object.keys(curr)]);

    for (const key of allKeys) {
      const prevVal = prev?.[key];
      const currVal = curr[key];
      const prevExists = prev && key in prev;
      const currExists = key in curr;

      if (!prevExists && currExists) {
        changes.push({ key, type: 'added', value: currVal });
      } else if (prevExists && !currExists) {
        changes.push({ key, type: 'removed', value: prevVal });
      } else if (prevExists && currExists && !deepEqual(prevVal, currVal)) {
        changes.push({ key, type: 'changed', value: currVal, oldValue: prevVal });
      } else if (prevExists && currExists) {
        changes.push({ key, type: 'unchanged', value: currVal });
      }
    }

    return changes;
  };

  const diff = useMemo(() => {
    if (!currentSnapshot || !prevSnapshot) return [];
    return computeDiff(prevSnapshot.data, currentSnapshot.data);
  }, [currentSnapshot, prevSnapshot]);

  if (!currentContextId) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-4 border-b bg-white">
          <h2 className="font-semibold mb-3">Context Inspector</h2>
          <p className="text-sm text-gray-500">Select a context from the timeline to inspect</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {contextIds.map(id => (
              <button
                key={id}
                onClick={() => onContextChange(id)}
                className={`w-full text-left p-3 rounded border ${currentContextId === id ? 'bg-purple-50 border-purple-200' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
              >
                <p className="font-medium text-gray-900">{id}</p>
                <p className="text-sm text-gray-500">{snapshots.get(id)?.length || 0} snapshots</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b bg-white">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Context: {currentContextId}</h2>
          <span className="px-2 py-0.5 text-xs bg-gray-100 rounded">{currentSnapshots.length} snapshots</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHistoryIndex(i => Math.max(0, i - 1))}
            disabled={historyIndex === 0}
            className="px-3 py-1 text-sm border rounded disabled:opacity-50"
          >
            ← Prev
          </button>
          <span className="text-sm text-gray-600">
            {historyIndex + 1} / {currentSnapshots.length} (seq: {currentSnapshot?.seq || '—'})
          </span>
          <button
            onClick={() => setHistoryIndex(i => Math.min(currentSnapshots.length - 1, i + 1))}
            disabled={historyIndex >= currentSnapshots.length - 1}
            className="px-3 py-1 text-sm border rounded disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      </div>

      {diff.length > 0 && (
        <div className="p-4 border-b bg-yellow-50">
          <p className="text-sm font-medium text-yellow-800 mb-2">
            Changes from previous snapshot ({diff.filter(d => d.type !== 'unchanged').length} changes)
          </p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {diff.filter(d => d.type !== 'unchanged').map((d, i) => (
              <div key={i} className={`text-xs px-2 py-1 rounded ${d.type === 'added' ? 'bg-green-100 text-green-800' : d.type === 'removed' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                <span className="font-mono">{d.key}</span> {d.type === 'changed' ? '→' : d.type === 'added' ? '+' : '−'}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-4">
        {currentSnapshot && (
          <JsonTree
            data={currentSnapshot.data}
            path="root"
            expandedKeys={expandedKeys}
            onToggle={toggleKey}
            diff={diff}
          />
        )}
      </div>
    </div>
  );
}

interface DiffEntry {
  key: string;
  type: 'added' | 'removed' | 'changed' | 'unchanged';
  value: unknown;
  oldValue?: unknown;
}

interface JsonTreeProps {
  data: unknown;
  path: string;
  expandedKeys: Set<string>;
  onToggle: (key: string) => void;
  diff?: DiffEntry[];
}

function JsonTree({ data, path, expandedKeys, onToggle, diff }: JsonTreeProps) {
  const isExpanded = expandedKeys.has(path);
  const diffEntry = diff?.find(d => d.key === path.split('.').pop());

  if (data === null) {
    return <span className="text-gray-400">null</span>;
  }

  if (typeof data !== 'object') {
    const typeClass = typeof data === 'string' ? 'text-green-600' :
                      typeof data === 'number' ? 'text-blue-600' :
                      typeof data === 'boolean' ? 'text-purple-600' : 'text-gray-600';
    return <span className={typeClass}>{typeof data === 'string' ? `"${data}"` : String(data)}</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-gray-400">[]</span>;

    return (
      <div className="ml-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onToggle(path)}
            className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600"
          >
            <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <span className="text-gray-500">Array[{data.length}]</span>
          {diffEntry && <span className={`text-xs px-1 rounded ${diffEntry.type === 'added' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{diffEntry.type}</span>}
        </div>
        {isExpanded && (
          <div className="ml-4 space-y-1 border-l border-gray-200 pl-2">
            {data.slice(0, 100).map((item, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-gray-400 font-mono text-xs">[{i}]</span>
                <JsonTree
                  data={item}
                  path={`${path}[${i}]`}
                  expandedKeys={expandedKeys}
                  onToggle={onToggle}
                  diff={diff}
                />
              </div>
            ))}
            {data.length > 100 && <span className="text-gray-400 text-sm">... and {data.length - 100} more items</span>}
          </div>
        )}
      </div>
    );
  }

  const entries = Object.entries(data);
  if (entries.length === 0) return <span className="text-gray-400">{}</span>;

  return (
    <div className="ml-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => onToggle(path)}
          className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600"
        >
          <svg className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <span className="text-gray-500">Object</span>
        {diffEntry && <span className={`text-xs px-1 rounded ${diffEntry.type === 'added' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{diffEntry.type}</span>}
      </div>
      {isExpanded && (
        <div className="ml-4 space-y-1 border-l border-gray-200 pl-2">
          {entries.map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <span className="font-mono text-sm text-gray-700">{key}</span>
              <span className="text-gray-400">:</span>
              <JsonTree
                data={value}
                path={`${path}.${key}`}
                expandedKeys={expandedKeys}
                onToggle={onToggle}
                diff={diff}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    const arrB = b as unknown[];
    if (a.length !== arrB.length) return false;
    return a.every((val, i) => deepEqual(val, arrB[i]));
  }

  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  if (keysA.length !== keysB.length) return false;
  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  return keysA.every(key => deepEqual(objA[key], objB[key]));
}