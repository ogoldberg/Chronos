import { useEffect, useRef, useState } from 'react';
import { makeCustomTheme, type TimelineTheme } from '../../data/themes';

/**
 * Form for creating a new custom themed track, or editing an existing
 * one. The user supplies a label + description; emoji and color have
 * sensible defaults but can be picked from small palettes. Tags are
 * entered as a comma-separated string and used for two things:
 *
 *  1. Matching existing events on the shared dataset, so the new track
 *     immediately shows any relevant anchor/discovered events.
 *  2. Passed to /api/lens/discover as the lens focus, so the backend
 *     can fetch fresh topic-specific events.
 *
 * Kept plain HTML — no form library — because this is a tiny form and
 * all the state lives on the parent via the `onSave` callback.
 */
interface Props {
  /** If set, the modal opens in "edit" mode preloaded with this theme. */
  initial?: TimelineTheme | null;
  onClose: () => void;
  onSave: (theme: TimelineTheme) => void;
}

const COLOR_CHOICES = [
  '#14b8a6', '#f97316', '#ec4899', '#8b5cf6', '#0ea5e9',
  '#f59e0b', '#10b981', '#ef4444', '#6366f1', '#06b6d4',
];

const EMOJI_CHOICES = ['✨', '🧵', '🔭', '🗺️', '🪐', '🎭', '⏳', '🧭', '🔗', '🌱'];

export default function CustomThemeModal({ initial, onClose, onSave }: Props) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [tagsText, setTagsText] = useState((initial?.tags ?? []).join(', '));
  const [emoji, setEmoji] = useState(initial?.emoji ?? '✨');
  const [color, setColor] = useState(initial?.color ?? COLOR_CHOICES[0]);
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    labelRef.current?.focus();
  }, []);

  // Esc closes, Cmd/Ctrl+Enter saves — matches the rest of the app's
  // keyboard conventions (command palette, etc.).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  function save() {
    if (!label.trim()) {
      labelRef.current?.focus();
      return;
    }
    const tags = tagsText
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
    const theme = makeCustomTheme({
      id: initial?.id, // preserve id when editing
      label,
      description,
      emoji,
      color,
      tags,
    });
    onSave(theme);
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(6,9,18,0.55)',
          backdropFilter: 'blur(6px)',
          zIndex: 90,
        }}
      />
      <div
        role="dialog"
        aria-label={initial ? 'Edit custom timeline' : 'New custom timeline'}
        style={{
          position: 'fixed',
          top: '16vh',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(520px, 92vw)',
          background: 'var(--ink-800, #0d1117)',
          border: '1px solid var(--hairline-strong, rgba(244,236,216,0.12))',
          borderRadius: 14,
          padding: '22px 24px',
          zIndex: 91,
          boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
          color: 'var(--paper, #f5f1e8)',
          fontFamily: 'var(--font-ui, -apple-system, sans-serif)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-display, Georgia, serif)',
            fontStyle: 'italic',
            fontSize: 20,
            marginBottom: 4,
          }}
        >
          {initial ? 'Edit thread' : 'New themed thread'}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display, Georgia, serif)',
            fontStyle: 'italic',
            fontSize: 12,
            color: 'rgba(255,255,255,0.5)',
            marginBottom: 18,
            lineHeight: 1.5,
          }}
        >
          Pick a topic, give it a name, and the timeline will generate events
          along the thread as you pan through history.
        </div>

        <Field label="Name">
          <input
            ref={labelRef}
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="e.g. History of the color blue"
            style={inputStyle}
          />
        </Field>

        <Field label="Description" hint="Used as context for AI event discovery">
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="A short sentence describing what this thread is about."
            rows={2}
            style={{ ...inputStyle, resize: 'vertical', minHeight: 52 }}
          />
        </Field>

        <Field
          label="Tags"
          hint="Comma-separated keywords used to match existing events"
        >
          <input
            value={tagsText}
            onChange={e => setTagsText(e.target.value)}
            placeholder="e.g. pigment, ultramarine, indigo, dye"
            style={inputStyle}
          />
        </Field>

        <div style={{ display: 'flex', gap: 24, marginTop: 12 }}>
          <div>
            <div style={labelStyle}>Icon</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 200 }}>
              {EMOJI_CHOICES.map(e => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 6,
                    border: `1px solid ${emoji === e ? color : 'rgba(255,255,255,0.1)'}`,
                    background: emoji === e ? color + '22' : 'transparent',
                    cursor: 'pointer',
                    fontSize: 16,
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={labelStyle}>Color</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 240 }}>
              {COLOR_CHOICES.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    border: `2px solid ${color === c ? '#ffffff' : 'transparent'}`,
                    background: c,
                    cursor: 'pointer',
                  }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            marginTop: 24,
            paddingTop: 16,
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <button onClick={onClose} style={secondaryBtn}>Cancel</button>
          <button onClick={save} style={{ ...primaryBtn, background: color, borderColor: color }}>
            {initial ? 'Save changes' : 'Create thread'}
          </button>
        </div>
      </div>
    </>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={labelStyle}>{label}</div>
      {children}
      {hint && (
        <div
          style={{
            fontFamily: 'var(--font-display, Georgia, serif)',
            fontStyle: 'italic',
            fontSize: 11,
            color: 'rgba(255,255,255,0.4)',
            marginTop: 4,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display, Georgia, serif)',
  fontStyle: 'italic',
  fontSize: 11,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.55)',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  color: 'var(--paper, #f5f1e8)',
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
};

const primaryBtn: React.CSSProperties = {
  padding: '8px 18px',
  borderRadius: 8,
  border: '1px solid',
  color: '#0a0d14',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const secondaryBtn: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'transparent',
  color: 'rgba(255,255,255,0.7)',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
