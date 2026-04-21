import { useState } from 'react';
import { THEMES, type TimelineTheme } from '../../data/themes';
import { useUIStore } from '../../stores/uiStore';
import { useTimelineStore, getAllEvents } from '../../stores/timelineStore';
import { isEventVisible } from '../../canvas/viewport';
import CustomThemeModal from './CustomThemeModal';
import ProposeConvergenceModal from './ProposeConvergenceModal';

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
  const customThemes = useUIStore(s => s.customThemes);
  const addCustomTheme = useUIStore(s => s.addCustomTheme);
  const removeCustomTheme = useUIStore(s => s.removeCustomTheme);
  const viewport = useTimelineStore(s => s.viewport);
  const allEvents = useTimelineStore(getAllEvents);
  const proposedThreads = useTimelineStore(s => s.proposedThreads);
  const removeProposedThread = useTimelineStore(s => s.removeProposedThread);
  const clearProposedThreads = useTimelineStore(s => s.clearProposedThreads);
  const [expanded, setExpanded] = useState(false);
  const [modalState, setModalState] = useState<
    { mode: 'new' } | { mode: 'edit'; theme: TimelineTheme } | null
  >(null);
  const [proposeOpen, setProposeOpen] = useState(false);

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
        title={
          enabled
            ? (expanded ? 'Collapse theme panel' : 'Adjust themes or turn off')
            : 'Show parallel themed timelines'
        }
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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '2px 4px 6px',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-display, Georgia, serif)',
                fontStyle: 'italic',
                fontSize: 10,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.4)',
              }}
            >
              Themes
            </span>
            <button
              onClick={() => {
                toggle();
                setExpanded(false);
              }}
              title="Turn off parallel threads"
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 6,
                color: 'rgba(255,255,255,0.6)',
                fontSize: 10,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '3px 8px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Turn off
            </button>
          </div>
          {THEMES.map(theme => (
            <ThemeRow
              key={theme.id}
              theme={theme}
              on={activeThemes.has(theme.id)}
              onToggle={() => toggleTheme(theme.id)}
            />
          ))}

          {customThemes.length > 0 && (
            <div
              style={{
                fontFamily: 'var(--font-display, Georgia, serif)',
                fontStyle: 'italic',
                fontSize: 10,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.4)',
                padding: '10px 4px 4px',
              }}
            >
              Your threads
            </div>
          )}
          {customThemes.map(theme => (
            <ThemeRow
              key={theme.id}
              theme={theme}
              on={activeThemes.has(theme.id)}
              onToggle={() => toggleTheme(theme.id)}
              onEdit={() => setModalState({ mode: 'edit', theme })}
              onDelete={() => {
                if (confirm(`Delete "${theme.label}"? This removes the thread and its discovered events will fade out.`)) {
                  removeCustomTheme(theme.id);
                }
              }}
            />
          ))}

          <button
            onClick={() => setModalState({ mode: 'new' })}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'rgba(255,255,255,0.04)',
              border: '1px dashed rgba(255,255,255,0.18)',
              borderRadius: 8,
              padding: '7px 10px',
              color: 'rgba(255,255,255,0.75)',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              textAlign: 'left',
              marginTop: 6,
            }}
          >
            <span style={{ fontSize: 13 }}>+</span>
            <span style={{ flex: 1 }}>New thread…</span>
          </button>

          <button
            onClick={() => setProposeOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'rgba(246,183,60,0.10)',
              border: '1px solid rgba(246,183,60,0.35)',
              borderRadius: 8,
              padding: '7px 10px',
              color: '#f6b73c',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              textAlign: 'left',
              marginTop: 4,
            }}
          >
            <span style={{ fontSize: 13 }}>💭</span>
            <span style={{ flex: 1 }}>Propose a connection…</span>
          </button>

          {proposedThreads.length > 0 && (
            <div
              style={{
                marginTop: 10,
                paddingTop: 10,
                borderTop: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '2px 4px 6px',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-display, Georgia, serif)',
                    fontStyle: 'italic',
                    fontSize: 10,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.4)',
                  }}
                >
                  Your threads · {proposedThreads.length}
                </span>
                <button
                  onClick={clearProposedThreads}
                  title="Clear all proposed threads"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255,255,255,0.4)',
                    fontSize: 10,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  clear
                </button>
              </div>
              {proposedThreads.map(t => (
                <div
                  key={t.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 6px',
                    fontSize: 11,
                    color: 'rgba(255,255,255,0.7)',
                  }}
                  title={t.explanation}
                >
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.fromTitle} <span style={{ color: '#f6b73c' }}>→</span> {t.toTitle}
                  </span>
                  <button
                    onClick={() => removeProposedThread(t.id)}
                    style={iconBtnStyle}
                    title="Remove thread"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

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
            Your custom threads pull events from the AI as you explore.
          </div>
        </div>
      )}

      {modalState && (
        <CustomThemeModal
          initial={modalState.mode === 'edit' ? modalState.theme : null}
          onClose={() => setModalState(null)}
          onSave={(theme) => {
            addCustomTheme(theme);
            setModalState(null);
          }}
        />
      )}

      {proposeOpen && (
        <ProposeConvergenceModal
          onClose={() => setProposeOpen(false)}
          viewport={viewport}
          visibleEvents={allEvents.filter(ev => isEventVisible(ev, viewport))}
        />
      )}
    </div>
  );
}

function ThemeRow({
  theme,
  on,
  onToggle,
  onEdit,
  onDelete,
}: {
  theme: TimelineTheme;
  on: boolean;
  onToggle: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: on ? theme.color + '22' : 'transparent',
        border: `1px solid ${on ? theme.color + '55' : 'rgba(255,255,255,0.06)'}`,
        borderRadius: 8,
        paddingLeft: 10,
      }}
    >
      <button
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flex: 1,
          background: 'transparent',
          border: 'none',
          padding: '6px 0',
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
      {onEdit && (
        <button
          onClick={onEdit}
          title="Edit thread"
          style={iconBtnStyle}
        >
          ✎
        </button>
      )}
      {onDelete && (
        <button
          onClick={onDelete}
          title="Delete thread"
          style={{ ...iconBtnStyle, marginRight: 4 }}
        >
          ×
        </button>
      )}
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'rgba(255,255,255,0.5)',
  fontSize: 12,
  cursor: 'pointer',
  padding: '4px 6px',
  fontFamily: 'inherit',
};
