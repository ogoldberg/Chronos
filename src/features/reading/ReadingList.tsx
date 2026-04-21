import { useState, useCallback } from 'react';
import { aiFetch } from '../../services/aiRequest';

interface ReadingItem {
  title: string;
  author: string;
  type: 'book' | 'documentary' | 'podcast' | 'museum';
  year: number;
  description: string;
  relevance: string;
}

interface Props {
  onClose: () => void;
  viewport?: { centerYear: number; span: number };
}

const TYPE_ICONS: Record<ReadingItem['type'], string> = {
  book: '\u{1F4DA}',
  documentary: '\u{1F3AC}',
  podcast: '\u{1F399}\uFE0F',
  museum: '\u{1F3DB}\uFE0F',
};

const TYPE_LABELS: Record<ReadingItem['type'], string> = {
  book: 'Book',
  documentary: 'Documentary',
  podcast: 'Podcast',
  museum: 'Museum',
};

const STORAGE_KEY = 'chronos_reading_list';

function loadSavedList(): ReadingItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage(items: ReadingItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export default function ReadingList({ onClose, viewport }: Props) {
  const [topic, setTopic] = useState('');
  const [items, setItems] = useState<ReadingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [savedList, setSavedList] = useState<ReadingItem[]>(loadSavedList);
  const [showSaved, setShowSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSubmit = useCallback(async (useViewport?: boolean) => {
    const t = useViewport
      ? `Events around year ${Math.round(viewport?.centerYear ?? 2000)} (span: ${Math.round(viewport?.span ?? 100)} years)`
      : topic.trim();
    if (!t) return;

    setLoading(true);
    setError('');
    setItems([]);

    try {
      const resp = await aiFetch('/api/reading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: t }),
      });

      if (resp.status === 429) {
        setError('Too many requests. Please wait a moment and try again.');
        setLoading(false);
        return;
      }

      if (!resp.ok) {
        setError('Failed to generate reading list. Try again.');
        setLoading(false);
        return;
      }

      const data = await resp.json();
      if (data.items?.length) {
        setItems(data.items);
      } else {
        setError('Could not generate recommendations. Try a different topic.');
      }
    } catch {
      setError('Connection error. Check your network and try again.');
    } finally {
      setLoading(false);
    }
  }, [topic, viewport]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const handleSaveItem = (item: ReadingItem) => {
    const exists = savedList.some(s => s.title === item.title && s.author === item.author);
    if (exists) return;
    const next = [...savedList, item];
    setSavedList(next);
    saveToStorage(next);
  };

  const handleRemoveItem = (item: ReadingItem) => {
    const next = savedList.filter(s => !(s.title === item.title && s.author === item.author));
    setSavedList(next);
    saveToStorage(next);
  };

  const isSaved = (item: ReadingItem) =>
    savedList.some(s => s.title === item.title && s.author === item.author);

  const handleShare = () => {
    const list = items.length > 0 ? items : savedList;
    const text = list.map((item, i) =>
      `${i + 1}. ${TYPE_ICONS[item.type]} ${item.title} by ${item.author} (${TYPE_LABELS[item.type]}, ${item.year})\n   ${item.description}\n   Relevance: ${item.relevance}`
    ).join('\n\n');
    navigator.clipboard.writeText(`CHRONOS Reading List\n\n${text}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const renderItem = (item: ReadingItem, idx: number, showSaveBtn: boolean) => (
    <div
      key={`${item.title}-${idx}`}
      style={{
        marginBottom: 10,
        padding: 12,
        background: 'rgba(16, 185, 129, 0.04)',
        border: '1px solid rgba(16, 185, 129, 0.2)',
        borderRadius: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>{TYPE_ICONS[item.type]}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#6ee7b7', fontSize: 13, fontWeight: 600 }}>{item.title}</div>
          <div style={{ fontSize: 11, color: '#ffffff80', marginTop: 2 }}>
            {item.author} &middot; {TYPE_LABELS[item.type]} &middot; {item.year}
          </div>
          <p style={{ color: '#ffffffbb', fontSize: 12, lineHeight: 1.5, margin: '6px 0 4px' }}>
            {item.description}
          </p>
          <div style={{ fontSize: 11, color: '#34d39990', fontStyle: 'italic' }}>
            {item.relevance}
          </div>
        </div>
      </div>
      {showSaveBtn && (
        <button
          onClick={() => isSaved(item) ? handleRemoveItem(item) : handleSaveItem(item)}
          style={{
            marginTop: 8,
            padding: '4px 10px',
            fontSize: 10,
            fontWeight: 600,
            background: isSaved(item) ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.04)',
            border: isSaved(item)
              ? '1px solid rgba(16, 185, 129, 0.4)'
              : '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            color: isSaved(item) ? '#6ee7b7' : '#ffffffaa',
            cursor: 'pointer',
          }}
        >
          {isSaved(item) ? '\u2713 Saved' : 'Save to my list'}
        </button>
      )}
      {!showSaveBtn && (
        <button
          onClick={() => handleRemoveItem(item)}
          style={{
            marginTop: 8,
            padding: '4px 10px',
            fontSize: 10,
            fontWeight: 600,
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 6,
            color: '#fca5a5',
            cursor: 'pointer',
          }}
        >
          Remove
        </button>
      )}
    </div>
  );

  return (
    <div
      style={{
        position: 'absolute',
        top: 80,
        right: 20,
        width: collapsed ? 44 : 440,
        maxHeight: collapsed ? 44 : 'calc(100vh - 120px)',
        background: 'rgba(13, 17, 23, 0.95)',
        borderRadius: 14,
        border: '1px solid rgba(16, 185, 129, 0.25)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(16, 185, 129, 0.06)',
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
          borderBottom: collapsed ? 'none' : '1px solid rgba(16, 185, 129, 0.15)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 16 }}>{'\u{1F4DA}'}</span>
        {!collapsed && (
          <>
            <span style={{ color: '#10b981', fontSize: 12, fontWeight: 600, letterSpacing: 0.5 }}>
              READING LIST
            </span>
            <span style={{
              marginLeft: 8,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 1,
              color: '#6ee7b7',
              background: 'rgba(16, 185, 129, 0.15)',
              padding: '2px 6px',
              borderRadius: 4,
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}>
              AI CURATED
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#ffffff40', cursor: 'pointer', fontSize: 14, padding: 2 }}
            >
              {'\u2715'}
            </button>
          </>
        )}
      </div>

      {!collapsed && (
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 16px 16px' }}>
          {/* Toggle: Generated / Saved */}
          <div style={{ display: 'flex', gap: 6, margin: '12px 0' }}>
            <button
              onClick={() => setShowSaved(false)}
              style={{
                flex: 1,
                padding: '7px 0',
                fontSize: 11,
                fontWeight: 600,
                background: !showSaved ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255,255,255,0.04)',
                border: !showSaved
                  ? '1px solid rgba(16, 185, 129, 0.3)'
                  : '1px solid rgba(255,255,255,0.06)',
                borderRadius: 6,
                color: !showSaved ? '#6ee7b7' : '#ffffff60',
                cursor: 'pointer',
              }}
            >
              Generate
            </button>
            <button
              onClick={() => setShowSaved(true)}
              style={{
                flex: 1,
                padding: '7px 0',
                fontSize: 11,
                fontWeight: 600,
                background: showSaved ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255,255,255,0.04)',
                border: showSaved
                  ? '1px solid rgba(16, 185, 129, 0.3)'
                  : '1px solid rgba(255,255,255,0.06)',
                borderRadius: 6,
                color: showSaved ? '#6ee7b7' : '#ffffff60',
                cursor: 'pointer',
              }}
            >
              My List ({savedList.length})
            </button>
          </div>

          {/* Saved list view */}
          {showSaved && (
            <div>
              {savedList.length === 0 && (
                <div style={{ textAlign: 'center', padding: '30px 0', color: '#ffffff50', fontSize: 12 }}>
                  No saved items yet. Generate a reading list and save items you like.
                </div>
              )}
              {savedList.map((item, i) => renderItem(item, i, false))}
              {savedList.length > 0 && (
                <button
                  onClick={handleShare}
                  style={{
                    width: '100%',
                    marginTop: 8,
                    padding: '8px 0',
                    fontSize: 12,
                    fontWeight: 600,
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: 8,
                    color: '#6ee7b7',
                    cursor: 'pointer',
                  }}
                >
                  {copied ? '\u2713 Copied to clipboard!' : 'Copy list to clipboard'}
                </button>
              )}
            </div>
          )}

          {/* Generate view */}
          {!showSaved && (
            <>
              {/* Input */}
              <div style={{ marginBottom: 12 }}>
                <input
                  type="text"
                  placeholder="Enter a topic or era..."
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  onKeyDown={handleKeyDown}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: 13,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: 10,
                    color: '#ffffffdd',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  maxLength={200}
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button
                    onClick={() => handleSubmit()}
                    disabled={!topic.trim() || loading}
                    style={{
                      flex: 1,
                      padding: '9px 0',
                      fontSize: 13,
                      fontWeight: 600,
                      background: topic.trim() && !loading
                        ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(5, 150, 105, 0.2))'
                        : 'rgba(255,255,255,0.04)',
                      border: topic.trim() && !loading
                        ? '1px solid rgba(16, 185, 129, 0.4)'
                        : '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 8,
                      color: topic.trim() && !loading ? '#a7f3d0' : '#ffffff30',
                      cursor: topic.trim() && !loading ? 'pointer' : 'default',
                      transition: 'all 0.2s',
                    }}
                  >
                    {loading ? 'Generating...' : 'Generate'}
                  </button>
                  {viewport && (
                    <button
                      onClick={() => handleSubmit(true)}
                      disabled={loading}
                      style={{
                        flex: 1,
                        padding: '9px 0',
                        fontSize: 11,
                        fontWeight: 600,
                        background: !loading
                          ? 'rgba(16, 185, 129, 0.08)'
                          : 'rgba(255,255,255,0.04)',
                        border: !loading
                          ? '1px solid rgba(16, 185, 129, 0.25)'
                          : '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 8,
                        color: !loading ? '#6ee7b7' : '#ffffff30',
                        cursor: !loading ? 'pointer' : 'default',
                        transition: 'all 0.2s',
                      }}
                    >
                      Generate for current view
                    </button>
                  )}
                </div>
              </div>

              {/* Loading */}
              {loading && (
                <div style={{ textAlign: 'center', padding: '30px 0', color: '#10b981', fontSize: 13 }}>
                  <div style={{ marginBottom: 8, fontSize: 24 }}>{'\u{1F4DA}'}</div>
                  Curating recommendations...
                </div>
              )}

              {/* Error */}
              {error && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 10 }}>{error}</div>
                  <button
                    onClick={() => handleSubmit()}
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      padding: '6px 16px',
                      color: '#ffffffaa',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Results */}
              {items.length > 0 && (
                <div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 10,
                  }}>
                    <div style={{
                      fontSize: 10,
                      color: '#6ee7b7',
                      fontWeight: 700,
                      letterSpacing: 1,
                    }}>
                      {items.length} RECOMMENDATIONS
                    </div>
                    <button
                      onClick={handleShare}
                      style={{
                        padding: '3px 8px',
                        fontSize: 10,
                        background: 'rgba(16, 185, 129, 0.1)',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                        borderRadius: 4,
                        color: '#6ee7b7',
                        cursor: 'pointer',
                      }}
                    >
                      {copied ? '\u2713 Copied!' : 'Share list'}
                    </button>
                  </div>
                  {items.map((item, i) => renderItem(item, i, true))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
