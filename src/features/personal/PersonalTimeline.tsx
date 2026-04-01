import { useState, useCallback, useEffect, useRef } from 'react';
import type { TimelineEvent } from '../../types';

const STORAGE_KEY = 'chronos_personal_events';

interface PersonalEvent {
  id: string;
  title: string;
  date: string; // ISO date string
  year: number;
  description: string;
  emoji: string;
  source: 'personal';
}

interface Props {
  onClose?: () => void;
  onAddEvents?: (events: TimelineEvent[]) => void;
}

const EMOJI_OPTIONS = [
  '\u{1F476}', '\u{1F393}', '\u{1F4BC}', '\u{1F48D}', '\u{1F3E0}', '\u{2708}\uFE0F',
  '\u{1F3C6}', '\u{1F381}', '\u{2764}\uFE0F', '\u{1F4DA}', '\u{1F3B5}', '\u{1F3A8}',
  '\u{1F697}', '\u{1F37D}\uFE0F', '\u{1F4AA}', '\u{2B50}', '\u{1F389}', '\u{1F3D6}\uFE0F',
  '\u{1F6A0}', '\u{1F3AF}', '\u{1F31F}', '\u{1F308}', '\u{1F4F7}', '\u{1F52C}',
];

function loadEvents(): PersonalEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveEvents(events: PersonalEvent[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

function dateToYear(dateStr: string): number {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const dayOfYear = Math.floor((d.getTime() - new Date(year, 0, 1).getTime()) / 86400000);
  return year + dayOfYear / 365;
}

function toTimelineEvent(pe: PersonalEvent): TimelineEvent {
  return {
    id: pe.id,
    title: pe.title,
    year: pe.year,
    emoji: pe.emoji,
    color: '#d4a017',
    description: pe.description,
    category: 'modern',
    source: 'personal',
    timestamp: new Date(pe.date).toISOString(),
    precision: 'day',
    confidence: 'verified',
  };
}

export default function PersonalTimeline({ onClose, onAddEvents }: Props) {
  const [events, setEvents] = useState<PersonalEvent[]>(() => loadEvents());
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('\u{2B50}');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [historicalContext, setHistoricalContext] = useState<Record<string, string[]>>({});
  const formRef = useRef<HTMLDivElement>(null);

  // Persist and sync events to timeline
  useEffect(() => {
    saveEvents(events);
    if (onAddEvents && events.length > 0) {
      onAddEvents(events.map(toTimelineEvent));
    }
  }, [events, onAddEvents]);

  // Fetch historical context for events
  useEffect(() => {
    const fetchContext = async () => {
      const ctx: Record<string, string[]> = {};
      for (const evt of events) {
        const year = Math.round(evt.year);
        const key = evt.id;
        if (historicalContext[key]) {
          ctx[key] = historicalContext[key];
          continue;
        }
        try {
          const resp = await fetch(`/api/search?q=${encodeURIComponent(String(year))}&limit=3`);
          if (resp.ok) {
            const data = await resp.json();
            if (data.events?.length) {
              ctx[key] = data.events.slice(0, 3).map((e: any) => `${e.emoji || ''} ${e.title} (${Math.round(e.year)})`);
            }
          }
        } catch { /* silently skip */ }
      }
      if (Object.keys(ctx).length > 0) {
        setHistoricalContext(prev => ({ ...prev, ...ctx }));
      }
    };
    if (events.length > 0) fetchContext();
  }, [events.length]);

  const handleSubmit = useCallback(() => {
    if (!title.trim() || !date) return;

    const yearNum = dateToYear(date);

    if (editingId) {
      setEvents(prev => prev.map(e =>
        e.id === editingId
          ? { ...e, title: title.trim(), date, year: yearNum, description: description.trim(), emoji }
          : e
      ));
      setEditingId(null);
    } else {
      const newEvent: PersonalEvent = {
        id: `personal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: title.trim(),
        date,
        year: yearNum,
        description: description.trim(),
        emoji,
        source: 'personal',
      };
      setEvents(prev => [...prev, newEvent]);
    }
    setTitle('');
    setDate('');
    setDescription('');
    setEmoji('\u{2B50}');
  }, [title, date, description, emoji, editingId]);

  const handleEdit = useCallback((evt: PersonalEvent) => {
    setTitle(evt.title);
    setDate(evt.date);
    setDescription(evt.description);
    setEmoji(evt.emoji);
    setEditingId(evt.id);
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleDelete = useCallback((id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setTitle('');
      setDate('');
      setDescription('');
      setEmoji('\u{2B50}');
    }
  }, [editingId]);

  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chronos_personal_events.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [events]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const imported = JSON.parse(ev.target?.result as string);
          if (Array.isArray(imported)) {
            const valid = imported.filter((e: any) => e.id && e.title && e.date && e.emoji);
            setEvents(prev => {
              const existingIds = new Set(prev.map(p => p.id));
              const newOnes = valid.filter((v: PersonalEvent) => !existingIds.has(v.id));
              return [...prev, ...newOnes];
            });
          }
        } catch { /* ignore bad files */ }
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  const sortedEvents = [...events].sort((a, b) => b.year - a.year);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    fontSize: 12,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    color: '#ffffffdd',
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 80,
        right: 20,
        width: collapsed ? 44 : 400,
        maxHeight: collapsed ? 44 : 'calc(100vh - 120px)',
        background: 'rgba(13, 17, 23, 0.95)',
        borderRadius: 14,
        border: '1px solid rgba(212, 160, 23, 0.25)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(212, 160, 23, 0.08)',
        zIndex: 30,
        overflow: 'hidden',
        transition: 'width 0.3s ease',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          padding: collapsed ? '10px 12px' : '12px 16px',
          borderBottom: collapsed ? 'none' : '1px solid rgba(212, 160, 23, 0.15)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 16 }}>{'\u{1F4AB}'}</span>
        {!collapsed && (
          <>
            <span style={{ color: '#d4a017', fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}>
              MY LIFE ON THE TIMELINE
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#ffffff40', fontFamily: 'monospace' }}>
              {events.length} events
            </span>
            {onClose && (
              <button
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                style={{ background: 'none', border: 'none', color: '#ffffff40', cursor: 'pointer', fontSize: 14, padding: 2 }}
              >
                {'\u2715'}
              </button>
            )}
          </>
        )}
      </div>

      {!collapsed && (
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 16px 16px' }}>
          {/* Add/Edit Form */}
          <div ref={formRef} style={{ marginTop: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: '#d4a017', fontWeight: 600, marginBottom: 8, letterSpacing: 0.3 }}>
              {editingId ? 'EDIT EVENT' : 'ADD A LIFE EVENT'}
            </div>

            {/* Title */}
            <input
              type="text"
              placeholder="What happened? (e.g., I was born)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ ...inputStyle, marginBottom: 8 }}
              maxLength={100}
            />

            {/* Date */}
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ ...inputStyle, marginBottom: 8, colorScheme: 'dark' }}
            />

            {/* Description */}
            <textarea
              placeholder="More details (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              style={{ ...inputStyle, marginBottom: 8, resize: 'vertical', minHeight: 36 }}
              maxLength={500}
            />

            {/* Emoji Selector */}
            <div style={{ marginBottom: 10 }}>
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  background: 'rgba(212, 160, 23, 0.1)',
                  border: '1px solid rgba(212, 160, 23, 0.25)',
                  borderRadius: 8,
                  color: '#d4a017',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 18 }}>{emoji}</span>
                <span>Choose Emoji</span>
              </button>
              {showEmojiPicker && (
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 4,
                  marginTop: 6,
                  padding: 8,
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  {EMOJI_OPTIONS.map((em) => (
                    <button
                      key={em}
                      onClick={() => { setEmoji(em); setShowEmojiPicker(false); }}
                      style={{
                        width: 32,
                        height: 32,
                        fontSize: 18,
                        background: emoji === em ? 'rgba(212, 160, 23, 0.2)' : 'transparent',
                        border: emoji === em ? '1px solid rgba(212, 160, 23, 0.4)' : '1px solid transparent',
                        borderRadius: 6,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!title.trim() || !date}
              style={{
                width: '100%',
                padding: '9px 0',
                fontSize: 13,
                fontWeight: 600,
                background: title.trim() && date
                  ? 'linear-gradient(135deg, rgba(212, 160, 23, 0.3), rgba(218, 165, 32, 0.2))'
                  : 'rgba(255,255,255,0.04)',
                border: title.trim() && date
                  ? '1px solid rgba(212, 160, 23, 0.4)'
                  : '1px solid rgba(255,255,255,0.06)',
                borderRadius: 8,
                color: title.trim() && date ? '#f5d78e' : '#ffffff30',
                cursor: title.trim() && date ? 'pointer' : 'default',
                transition: 'all 0.2s',
              }}
            >
              {editingId ? 'Update Event' : 'Add to Timeline'}
            </button>
            {editingId && (
              <button
                onClick={() => {
                  setEditingId(null);
                  setTitle('');
                  setDate('');
                  setDescription('');
                  setEmoji('\u{2B50}');
                }}
                style={{
                  width: '100%',
                  marginTop: 4,
                  padding: '6px 0',
                  fontSize: 11,
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8,
                  color: '#ffffff60',
                  cursor: 'pointer',
                }}
              >
                Cancel Edit
              </button>
            )}
          </div>

          {/* Import/Export */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            <button
              onClick={handleExport}
              disabled={events.length === 0}
              style={{
                flex: 1,
                padding: '6px 0',
                fontSize: 11,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6,
                color: events.length ? '#ffffffaa' : '#ffffff30',
                cursor: events.length ? 'pointer' : 'default',
                fontWeight: 500,
              }}
            >
              Export JSON
            </button>
            <button
              onClick={handleImport}
              style={{
                flex: 1,
                padding: '6px 0',
                fontSize: 11,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6,
                color: '#ffffffaa',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Import JSON
            </button>
          </div>

          {/* Events List */}
          {sortedEvents.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#ffffff40', fontSize: 12 }}>
              No personal events yet. Add your first life event above!
            </div>
          )}

          {sortedEvents.map((evt) => {
            const d = new Date(evt.date);
            const dateLabel = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
            const ctx = historicalContext[evt.id];

            return (
              <div
                key={evt.id}
                style={{
                  marginBottom: 12,
                  padding: 12,
                  background: 'rgba(212, 160, 23, 0.06)',
                  border: '1px solid rgba(212, 160, 23, 0.2)',
                  borderRadius: 10,
                  borderLeft: '3px solid #d4a017',
                }}
              >
                {/* Event header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  {/* Diamond marker */}
                  <span style={{
                    width: 16,
                    height: 16,
                    background: '#d4a017',
                    transform: 'rotate(45deg)',
                    display: 'inline-block',
                    borderRadius: 2,
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 16 }}>{evt.emoji}</span>
                  <span style={{ color: '#f5d78e', fontSize: 13, fontWeight: 600, flex: 1 }}>{evt.title}</span>
                  <span style={{ fontSize: 10, color: '#ffffff50', fontFamily: 'monospace' }}>{dateLabel}</span>
                </div>

                {evt.description && (
                  <p style={{ color: '#ffffffaa', fontSize: 12, lineHeight: 1.5, margin: '0 0 8px 24px' }}>
                    {evt.description}
                  </p>
                )}

                {/* "What was happening" context */}
                {ctx && ctx.length > 0 && (
                  <div style={{
                    marginLeft: 24,
                    marginBottom: 8,
                    padding: '8px 10px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <div style={{ fontSize: 10, color: '#d4a017', fontWeight: 600, marginBottom: 4, letterSpacing: 0.3 }}>
                      SEE WHAT WAS HAPPENING WHEN...
                    </div>
                    {ctx.map((c, i) => (
                      <div key={i} style={{ fontSize: 11, color: '#ffffffaa', lineHeight: 1.5, marginBottom: 2 }}>
                        {c}
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, marginLeft: 24 }}>
                  <button
                    onClick={() => handleEdit(evt)}
                    style={{
                      padding: '4px 10px',
                      fontSize: 10,
                      background: 'rgba(99, 102, 241, 0.15)',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      borderRadius: 6,
                      color: '#a5b4fc',
                      cursor: 'pointer',
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(evt.id)}
                    style={{
                      padding: '4px 10px',
                      fontSize: 10,
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      borderRadius: 6,
                      color: '#fca5a5',
                      cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
