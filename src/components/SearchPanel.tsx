import { useState, useEffect, useRef, useCallback } from 'react';
import type { TimelineEvent } from '../types';
import { formatYear } from '../utils/format';
import { ANCHOR_EVENTS } from '../data/anchorEvents';

interface SearchResult {
  id: string;
  title: string;
  year: number;
  emoji: string;
  description: string;
  color: string;
}

interface Props {
  onNavigate: (year: number, span: number) => void;
  onSelectEvent: (event: TimelineEvent) => void;
  allEvents?: TimelineEvent[];
}

export default function SearchPanel({ onNavigate, onSelectEvent, allEvents = [] }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [dbAvailable, setDbAvailable] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check if DB is available on mount
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(() => setDbAvailable(true))
      .catch(() => setDbAvailable(false));
  }, []);

  // Keyboard shortcut: Ctrl+K or /
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      } else if (e.key === '/' && !open) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        setOpen(true);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [open]);

  // In-memory fallback search
  const searchInMemory = useCallback((q: string): SearchResult[] => {
    const lower = q.toLowerCase();
    const pool: TimelineEvent[] = [...ANCHOR_EVENTS, ...allEvents];
    const seen = new Set<string>();
    const matches: SearchResult[] = [];
    for (const ev of pool) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      const titleMatch = ev.title.toLowerCase().includes(lower);
      const descMatch = ev.description?.toLowerCase().includes(lower);
      if (titleMatch || descMatch) {
        matches.push({
          id: ev.id,
          title: ev.title,
          year: ev.year,
          emoji: ev.emoji,
          description: ev.description || '',
          color: ev.color,
        });
      }
      if (matches.length >= 20) break;
    }
    return matches;
  }, [allEvents]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        if (dbAvailable) {
          const resp = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}&limit=20`);
          if (resp.ok) {
            const data = await resp.json();
            if (data.events?.length > 0) {
              setResults(data.events.map((e: SearchResult) => ({
                id: e.id,
                title: e.title,
                year: e.year,
                emoji: e.emoji || '\ud83d\udccc',
                description: e.description || '',
                color: e.color || '#888',
              })));
              setLoading(false);
              return;
            }
          }
        }
        // Fallback: in-memory search
        setResults(searchInMemory(query.trim()));
      } catch {
        // Fallback: in-memory search
        setResults(searchInMemory(query.trim()));
      }
      setLoading(false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, dbAvailable, searchInMemory]);

  function handleSelect(result: SearchResult) {
    // Calculate an appropriate span for the year
    const absYear = Math.abs(result.year);
    let span: number;
    if (absYear > 1e9) span = 5e9;
    else if (absYear > 1e6) span = 1e7;
    else if (absYear > 1e4) span = 5e4;
    else if (absYear > 1000) span = 500;
    else if (absYear > 100) span = 100;
    else span = 20;

    onNavigate(result.year, span);
    // Also select the event if it exists in allEvents or ANCHOR_EVENTS
    const found = [...ANCHOR_EVENTS, ...allEvents].find(e => e.id === result.id);
    if (found) onSelectEvent(found);
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Search timeline (Ctrl+K or /)"
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 900,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 10,
          padding: '8px 14px',
          color: '#ccc',
          cursor: 'pointer',
          fontSize: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          backdropFilter: 'blur(12px)',
        }}
      >
        <span style={{ fontSize: 16 }}>{'\ud83d\udd0d'}</span>
        <span>Search</span>
        <kbd style={{
          background: 'rgba(255,255,255,0.1)',
          borderRadius: 4,
          padding: '1px 6px',
          fontSize: 11,
          color: '#888',
        }}>/</kbd>
      </button>
    );
  }

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1000,
      display: 'flex',
      justifyContent: 'center',
      paddingTop: 60,
    }}>
      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: -1,
        }}
      />

      {/* Panel */}
      <div style={{
        width: '90vw',
        maxWidth: 560,
        background: 'rgba(10, 13, 20, 0.95)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        animation: 'searchSlideIn 0.2s ease-out',
      }}>
        {/* Search input */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '14px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          gap: 10,
        }}>
          <span style={{ fontSize: 18, opacity: 0.5 }}>{'\ud83d\udd0d'}</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search events across history..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#eee',
              fontSize: 16,
            }}
          />
          {loading && <span style={{ fontSize: 14, opacity: 0.4 }}>Loading...</span>}
          <kbd
            onClick={() => setOpen(false)}
            style={{
              background: 'rgba(255,255,255,0.1)',
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: 11,
              color: '#888',
              cursor: 'pointer',
            }}
          >ESC</kbd>
        </div>

        {/* Results */}
        <div style={{
          maxHeight: '50vh',
          overflowY: 'auto',
          padding: query.trim() ? '8px' : 0,
        }}>
          {query.trim() && !loading && results.length === 0 && (
            <div style={{
              padding: '24px 18px',
              textAlign: 'center',
              color: '#666',
              fontSize: 14,
            }}>
              No results found for &ldquo;{query}&rdquo;
            </div>
          )}
          {results.map(r => (
            <button
              key={r.id}
              onClick={() => handleSelect(r)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                width: '100%',
                padding: '12px 14px',
                background: 'transparent',
                border: 'none',
                borderRadius: 10,
                cursor: 'pointer',
                textAlign: 'left',
                color: '#ddd',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{
                fontSize: 24,
                lineHeight: '1',
                flexShrink: 0,
                width: 32,
                textAlign: 'center',
              }}>{r.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: 600,
                  fontSize: 14,
                  marginBottom: 2,
                  color: r.color,
                }}>{r.title}</div>
                <div style={{
                  fontSize: 12,
                  color: '#888',
                  marginBottom: 4,
                }}>{formatYear(r.year)}</div>
                <div style={{
                  fontSize: 12,
                  color: '#666',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>{r.description}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Footer */}
        {query.trim() && (
          <div style={{
            padding: '8px 18px 10px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            fontSize: 11,
            color: '#555',
            textAlign: 'center',
          }}>
            {dbAvailable ? 'Search powered by full-text index' : 'Searching in-memory events'}
          </div>
        )}
      </div>

      <style>{`
        @keyframes searchSlideIn {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
