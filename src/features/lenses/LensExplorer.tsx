import { useState, useCallback, useMemo } from 'react';
import {
  ACADEMIC_LENSES,
  THEMATIC_LENSES,
  createCustomLens,
  type KnowledgeLens,
} from '../../data/lenses';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  onActivateLens: (lens: KnowledgeLens) => void;
  onDeactivateLens: () => void;
  onClose: () => void;
  activeLens?: KnowledgeLens | null;
}

/* ------------------------------------------------------------------ */
/*  Tabs                                                               */
/* ------------------------------------------------------------------ */

type Tab = 'academic' | 'thematic' | 'my';

const TAB_LABELS: Record<Tab, string> = {
  academic: 'Academic',
  thematic: 'Thematic',
  my: 'My Lenses',
};

/* ------------------------------------------------------------------ */
/*  Color presets for custom lens creator                              */
/* ------------------------------------------------------------------ */

const COLOR_PRESETS = [
  '#dc143c', '#4169e1', '#ff69b4', '#20b2aa', '#daa520',
  '#9370db', '#228b22', '#ff8c00', '#e74c3c', '#2c3e50',
  '#8e44ad', '#16a085', '#f39c12', '#3498db', '#e67e22',
];

/* ------------------------------------------------------------------ */
/*  Persisted custom lenses (localStorage)                             */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'chronos-custom-lenses';

function loadCustomLenses(): KnowledgeLens[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as KnowledgeLens[];
  } catch {
    return [];
  }
}

function saveCustomLenses(lenses: KnowledgeLens[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lenses));
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function LensExplorer({
  onActivateLens,
  onDeactivateLens,
  onClose,
  activeLens,
}: Props) {
  const [tab, setTab] = useState<Tab>('academic');
  const [customLenses, setCustomLenses] = useState<KnowledgeLens[]>(loadCustomLenses);
  const [showCreator, setShowCreator] = useState(false);

  /* Creator form state */
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formTags, setFormTags] = useState('');
  const [formColor, setFormColor] = useState(COLOR_PRESETS[0]);
  const [formEmoji, setFormEmoji] = useState('');

  const lenses = useMemo<KnowledgeLens[]>(() => {
    if (tab === 'academic') return ACADEMIC_LENSES;
    if (tab === 'thematic') return THEMATIC_LENSES;
    return customLenses;
  }, [tab, customLenses]);

  /* Activate / deactivate */
  const handleCardClick = useCallback(
    (lens: KnowledgeLens) => {
      if (activeLens?.id === lens.id) {
        onDeactivateLens();
      } else {
        onActivateLens(lens);
      }
    },
    [activeLens, onActivateLens, onDeactivateLens],
  );

  /* Create custom lens */
  const handleCreate = useCallback(() => {
    if (!formName.trim()) return;
    const tags = formTags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
    const lens = createCustomLens(
      formName.trim(),
      formDesc.trim() || `Custom lens: ${formName.trim()}`,
      tags,
      formColor,
      formEmoji.trim() || undefined,
    );
    const updated = [...customLenses, lens];
    setCustomLenses(updated);
    saveCustomLenses(updated);
    setFormName('');
    setFormDesc('');
    setFormTags('');
    setFormEmoji('');
    setShowCreator(false);
    setTab('my');
  }, [formName, formDesc, formTags, formColor, formEmoji, customLenses]);

  /* Delete custom lens */
  const handleDelete = useCallback(
    (id: string) => {
      const updated = customLenses.filter(l => l.id !== id);
      setCustomLenses(updated);
      saveCustomLenses(updated);
      if (activeLens?.id === id) onDeactivateLens();
    },
    [customLenses, activeLens, onDeactivateLens],
  );

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <span style={{ fontSize: 18 }}>🔬</span>
        <span style={{ color: '#ffffffdd', fontSize: 14, fontWeight: 700, letterSpacing: 0.5 }}>
          Knowledge Lenses
        </span>
        <button onClick={onClose} style={closeBtnStyle} aria-label="Close">
          ✕
        </button>
      </div>

      {/* Active lens banner */}
      {activeLens && (
        <div
          style={{
            padding: '8px 16px',
            background: `linear-gradient(90deg, ${activeLens.color}30, transparent)`,
            borderBottom: `1px solid ${activeLens.color}40`,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 16 }}>{activeLens.emoji}</span>
          <span style={{ color: activeLens.color, fontSize: 12, fontWeight: 600, flex: 1 }}>
            {activeLens.name}
          </span>
          <button
            onClick={onDeactivateLens}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 6,
              color: '#ffffff99',
              fontSize: 11,
              padding: '3px 10px',
              cursor: 'pointer',
            }}
          >
            Clear Lens
          </button>
        </div>
      )}

      {/* Tab bar — pill-shaped toggles */}
      <div style={tabBarStyle}>
        {(['academic', 'thematic', 'my'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              ...tabBtnBase,
              background: tab === t ? 'rgba(255,255,255,0.12)' : 'transparent',
              color: tab === t ? '#ffffffdd' : '#ffffff60',
              fontWeight: tab === t ? 600 : 400,
            }}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Lens grid */}
      <div style={gridContainerStyle}>
        {lenses.map(lens => {
          const isActive = activeLens?.id === lens.id;
          return (
            <div
              key={lens.id}
              onClick={() => handleCardClick(lens)}
              style={{
                ...cardStyle,
                borderLeft: `3px solid ${lens.color}`,
                background: isActive
                  ? `linear-gradient(135deg, ${lens.color}18, rgba(13,17,23,0.85))`
                  : 'rgba(13, 17, 23, 0.7)',
                boxShadow: isActive ? `0 0 12px ${lens.color}30` : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 20 }}>{lens.emoji}</span>
                <span style={{ color: '#ffffffdd', fontSize: 13, fontWeight: 600, flex: 1 }}>
                  {lens.name}
                </span>
                {isActive && (
                  <span
                    style={{
                      fontSize: 9,
                      color: lens.color,
                      background: `${lens.color}20`,
                      padding: '2px 7px',
                      borderRadius: 8,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                    }}
                  >
                    ACTIVE
                  </span>
                )}
              </div>
              <div style={{ color: '#ffffff80', fontSize: 11, lineHeight: 1.45 }}>
                {lens.description}
              </div>
              {/* Delete button for custom lenses */}
              {lens.category === 'custom' && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    handleDelete(lens.id);
                  }}
                  style={{
                    marginTop: 6,
                    background: 'transparent',
                    border: 'none',
                    color: '#ffffff40',
                    fontSize: 10,
                    cursor: 'pointer',
                    padding: '2px 0',
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          );
        })}

        {/* Empty state for My Lenses */}
        {tab === 'my' && lenses.length === 0 && !showCreator && (
          <div style={{ color: '#ffffff50', fontSize: 12, padding: '20px 0', textAlign: 'center', gridColumn: '1 / -1' }}>
            No custom lenses yet. Create one below!
          </div>
        )}
      </div>

      {/* Create Custom Lens section */}
      {tab === 'my' && (
        <div style={{ padding: '0 16px 16px' }}>
          {!showCreator ? (
            <button onClick={() => setShowCreator(true)} style={createBtnStyle}>
              + Create Custom Lens
            </button>
          ) : (
            <div style={creatorFormStyle}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#ffffffbb', marginBottom: 10 }}>
                Create Custom Lens
              </div>

              {/* Name */}
              <input
                type="text"
                placeholder="Lens name (e.g. 'History of Coffee')"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                style={inputStyle}
                maxLength={60}
              />

              {/* Emoji (optional) */}
              <input
                type="text"
                placeholder="Emoji (optional, e.g. ☕)"
                value={formEmoji}
                onChange={e => setFormEmoji(e.target.value)}
                style={inputStyle}
                maxLength={4}
              />

              {/* Description */}
              <textarea
                placeholder="Brief description (1-2 sentences)"
                value={formDesc}
                onChange={e => setFormDesc(e.target.value)}
                style={{ ...inputStyle, minHeight: 50, resize: 'vertical', fontFamily: 'inherit' }}
                maxLength={200}
              />

              {/* Tags */}
              <input
                type="text"
                placeholder="Tags (comma-separated, e.g. coffee, bean, trade, cafe)"
                value={formTags}
                onChange={e => setFormTags(e.target.value)}
                style={inputStyle}
              />

              {/* Color picker */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#ffffff60', marginBottom: 6 }}>Lens color</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {COLOR_PRESETS.map(c => (
                    <button
                      key={c}
                      onClick={() => setFormColor(c)}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        background: c,
                        border: formColor === c ? '2px solid #fff' : '2px solid transparent',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleCreate} disabled={!formName.trim()} style={submitBtnStyle}>
                  Create Lens
                </button>
                <button
                  onClick={() => setShowCreator(false)}
                  style={{ ...submitBtnStyle, background: 'transparent', border: '1px solid rgba(255,255,255,0.12)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Styles                                                             */
/* ================================================================== */

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 60,
  right: 16,
  width: 380,
  maxHeight: 'calc(100vh - 100px)',
  background: 'rgba(13, 17, 23, 0.92)',
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,0.08)',
  backdropFilter: 'blur(24px)',
  zIndex: 50,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  padding: '14px 16px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const closeBtnStyle: React.CSSProperties = {
  marginLeft: 'auto',
  background: 'none',
  border: 'none',
  color: '#ffffff60',
  fontSize: 16,
  cursor: 'pointer',
  padding: '2px 6px',
};

const tabBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  padding: '10px 16px 6px',
};

const tabBtnBase: React.CSSProperties = {
  flex: 1,
  border: 'none',
  borderRadius: 20,
  padding: '6px 0',
  fontSize: 12,
  cursor: 'pointer',
  transition: 'all 0.2s',
};

const gridContainerStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '8px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const cardStyle: React.CSSProperties = {
  borderRadius: 10,
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.06)',
  padding: '10px 12px',
  cursor: 'pointer',
  transition: 'all 0.2s',
};

const createBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 0',
  border: '1px dashed rgba(255,255,255,0.15)',
  borderRadius: 10,
  background: 'transparent',
  color: '#ffffff70',
  fontSize: 12,
  cursor: 'pointer',
};

const creatorFormStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.3)',
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.08)',
  padding: 14,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  marginBottom: 8,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  color: '#ffffffcc',
  fontSize: 12,
  outline: 'none',
  boxSizing: 'border-box',
};

const submitBtnStyle: React.CSSProperties = {
  padding: '7px 16px',
  borderRadius: 8,
  border: 'none',
  background: 'rgba(65,105,225,0.6)',
  color: '#ffffffdd',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};
