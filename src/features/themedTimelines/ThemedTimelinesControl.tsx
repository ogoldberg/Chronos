import { useState } from 'react';
import { THEMES } from '../../data/themes';
import { useUIStore } from '../../stores/uiStore';

/**
 * Floating control that lives in the top-right of the canvas, next to
 * the editorial header. Collapsed it's a single chip ("⧉  Parallel
 * timelines"); expanded it shows a checkbox row for each theme so the
 * user can pick which tracks to weave.
 *
 * Kept intentionally minimal and self-contained — the command palette
 * also has an entry that toggles the mode, and the track rendering lives
 * in the canvas renderer, so this component only owns its own UI chrome.
 */
export default function ThemedTimelinesControl() {
  const enabled = useUIStore(s => s.themedTimelinesEnabled);
  const toggle = useUIStore(s => s.toggleThemedTimelines);
  const activeThemes = useUIStore(s => s.activeThemes);
  const toggleTheme = useUIStore(s => s.toggleActiveTheme);
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        position: 'absolute',
        top: 76,
        right: 20,
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 8,
        fontFamily: 'var(--font-ui, -apple-system, sans-serif)',
      }}
    >
      <button
        onClick={() => {
          if (!enabled) toggle();
          setExpanded(v => !v);
        }}
        title={enabled ? 'Hide parallel themed timelines' : 'Show parallel themed timelines'}
        style={{
          background: enabled ? 'rgba(244,236,216,0.12)' : 'rgba(13,17,23,0.85)',
          border: `1px solid ${enabled ? 'rgba(244,236,216,0.3)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 999,
          padding: '7px 14px',
          color: enabled ? '#f5f1e8' : '#ffffff80',
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.04em',
          cursor: 'pointer',
          backdropFilter: 'blur(10px)',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 13, lineHeight: 1 }}>⧉</span>
        <span>{enabled ? 'Threads on' : 'Parallel threads'}</span>
      </button>

      {enabled && expanded && (
        <div
          style={{
            background: 'rgba(13,17,23,0.92)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            backdropFilter: 'blur(12px)',
            minWidth: 200,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display, Georgia, serif)',
              fontStyle: 'italic',
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.4)',
              padding: '2px 4px 6px',
            }}
          >
            Themes
          </div>
          {THEMES.map(theme => {
            const on = activeThemes.has(theme.id);
            return (
              <button
                key={theme.id}
                onClick={() => toggleTheme(theme.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: on ? theme.color + '22' : 'transparent',
                  border: `1px solid ${on ? theme.color + '55' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 8,
                  padding: '6px 10px',
                  color: on ? '#f5f1e8' : 'rgba(255,255,255,0.55)',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ fontSize: 14 }}>{theme.emoji}</span>
                <span style={{ flex: 1 }}>{theme.label}</span>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: on ? theme.color : 'transparent',
                    border: `1px solid ${on ? theme.color : 'rgba(255,255,255,0.25)'}`,
                  }}
                />
              </button>
            );
          })}
          <div
            style={{
              fontFamily: 'var(--font-display, Georgia, serif)',
              fontStyle: 'italic',
              fontSize: 10,
              color: 'rgba(255,255,255,0.35)',
              padding: '6px 4px 0',
              lineHeight: 1.4,
            }}
          >
            Threads weave when an event belongs to more than one theme.
          </div>
        </div>
      )}
    </div>
  );
}
