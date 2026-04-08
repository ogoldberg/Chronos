import { useEffect, useMemo, useRef, useState } from 'react';
import type { PanelId } from '../stores/uiStore';
import { useUIStore } from '../stores/uiStore';

/**
 * A single command the user can run from the palette. `keywords` are
 * matched in addition to the label so e.g. "tour" finds Time-lapse and
 * "kids" finds Difficulty.
 */
interface Command {
  /** Stable identifier — also used as the React key. */
  id: string;
  /** What the user sees. */
  label: string;
  /** A short hint that follows the label, dimmed. */
  hint?: string;
  /** Which group the command belongs to in the rendered list. */
  group: 'navigate' | 'explore' | 'learn' | 'create' | 'system';
  /** Free-form aliases for fuzzy match. */
  keywords?: string[];
  /** What to do when the user runs the command. */
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Open a feature panel by id. */
  openPanel: (panel: PanelId) => void;
  /** Toggle the globe layer on or off. */
  toggleGlobe: () => void;
  /** Open the date / period picker (so the user can also reach it via ⌘K). */
  openDatePicker: () => void;
}

/**
 * ⌘K command palette. Replaces the 27-button toolbar with a single
 * keyboard-first surface. Open with ⌘K, type to filter, ↑↓ to move,
 * Enter to run, Esc to close. Click outside to dismiss.
 *
 * Commands are grouped editorially:
 *
 *   NAVIGATE — Jump to a date / Open chat
 *   EXPLORE  — Globe / Search / Compare regions / Time-lapse / Today / Graph / Lenses / Places / Connection graph
 *   LEARN    — Myths / Quiz / Reading / Sources / Figures / Classroom / Teach / Difficulty
 *   CREATE   — What If / Debate / Personal timeline / Community / Collab / Export / Review / Soundtrack / Data overlays
 *   SYSTEM   — Account / Help
 *
 * Selection is keyboard first; the rendered list is virtualized just
 * enough that we don't paint 30 invisible items, and arrow-key motion
 * scrolls the focused row into view.
 */
export default function CommandPalette({
  open,
  onClose,
  openPanel,
  toggleGlobe,
  openDatePicker,
}: Props) {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const toggleThemedTimelines = useUIStore(s => s.toggleThemedTimelines);

  const commands = useMemo<Command[]>(
    () => buildCommands({ openPanel, toggleGlobe, openDatePicker, toggleThemedTimelines }),
    [openPanel, toggleGlobe, openDatePicker, toggleThemedTimelines],
  );

  // Apply the query filter, preserving group order so the result list
  // doesn't shuffle wildly as the user types.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(cmd => {
      const haystack = [
        cmd.label,
        cmd.hint ?? '',
        cmd.group,
        ...(cmd.keywords ?? []),
      ]
        .join(' ')
        .toLowerCase();
      // Token AND match: every whitespace-separated token must appear.
      return q.split(/\s+/).every(tok => haystack.includes(tok));
    });
  }, [commands, query]);

  // Reset state whenever the palette opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Keep activeIdx in range when the filter changes.
  useEffect(() => {
    if (activeIdx >= filtered.length) setActiveIdx(0);
  }, [filtered.length, activeIdx]);

  // Keyboard handling
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filtered[activeIdx];
        if (cmd) {
          cmd.run();
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, filtered, activeIdx, onClose]);

  // Scroll the active item into view as the user moves through the list.
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIdx, open]);

  if (!open) return null;

  // Group items for rendering, preserving the iteration order of `filtered`.
  // We keep the section labels stable so a "no matches in this group" group
  // simply isn't rendered.
  const groups: { id: Command['group']; label: string; items: Command[] }[] = [
    { id: 'navigate', label: 'Navigate', items: [] },
    { id: 'explore', label: 'Explore', items: [] },
    { id: 'learn', label: 'Learn', items: [] },
    { id: 'create', label: 'Create', items: [] },
    { id: 'system', label: 'System', items: [] },
  ];
  for (const cmd of filtered) {
    const g = groups.find(g => g.id === cmd.group);
    if (g) g.items.push(cmd);
  }

  // Stable index across groups so arrow keys work consistently.
  let runningIdx = -1;

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(6, 9, 18, 0.55)',
          backdropFilter: 'blur(6px)',
          zIndex: 80,
          animation: 'cmdkFadeIn 160ms var(--ease-out)',
        }}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-label="Command palette"
        style={{
          position: 'fixed',
          top: '14vh',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(620px, 92vw)',
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--ink-800)',
          border: '1px solid var(--hairline-strong)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(244,236,216,0.04)',
          zIndex: 81,
          overflow: 'hidden',
          animation: 'cmdkRise 220ms var(--ease-out)',
        }}
      >
        {/* Search input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '18px 20px 16px',
            borderBottom: '1px solid var(--hairline)',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontSize: 16,
              color: 'var(--paper-mute)',
            }}
          >
            ⌕
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search Chronos…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--paper)',
              fontFamily: 'var(--font-ui)',
              fontSize: 17,
              letterSpacing: '0.005em',
            }}
          />
          <kbd
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              padding: '2px 6px',
              background: 'var(--ink-700)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--paper-faint)',
            }}
          >
            esc
          </kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px 0 12px',
          }}
        >
          {filtered.length === 0 && (
            <div
              style={{
                padding: '28px 24px',
                color: 'var(--paper-faint)',
                fontFamily: 'var(--font-display)',
                fontStyle: 'italic',
                fontSize: 14,
              }}
            >
              Nothing matches “{query}”.
            </div>
          )}

          {groups.map(group => {
            if (group.items.length === 0) return null;
            return (
              <div key={group.id} style={{ padding: '6px 0' }}>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontStyle: 'italic',
                    fontSize: 11,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'var(--paper-faint)',
                    padding: '6px 22px 8px',
                  }}
                >
                  {group.label}
                </div>
                {group.items.map(cmd => {
                  runningIdx++;
                  const isActive = runningIdx === activeIdx;
                  const myIdx = runningIdx;
                  return (
                    <button
                      key={cmd.id}
                      data-idx={myIdx}
                      onMouseEnter={() => setActiveIdx(myIdx)}
                      onClick={() => {
                        cmd.run();
                        onClose();
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 14,
                        width: '100%',
                        background: isActive ? 'var(--ink-700)' : 'transparent',
                        border: 'none',
                        padding: '10px 22px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        color: 'var(--paper)',
                        fontFamily: 'var(--font-ui)',
                        position: 'relative',
                      }}
                    >
                      {/* Active row gets a thin ember edge on the left */}
                      <span
                        aria-hidden
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 6,
                          bottom: 6,
                          width: 2,
                          background: isActive ? 'var(--ember)' : 'transparent',
                        }}
                      />
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{cmd.label}</span>
                      {cmd.hint && (
                        <span
                          style={{
                            fontSize: 12,
                            color: 'var(--paper-faint)',
                            fontStyle: 'italic',
                            fontFamily: 'var(--font-display)',
                          }}
                        >
                          {cmd.hint}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer hint row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 18px',
            borderTop: '1px solid var(--hairline)',
            background: 'var(--ink-900)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 11,
              fontStyle: 'italic',
              letterSpacing: '0.06em',
              color: 'var(--paper-faint)',
            }}
          >
            {filtered.length} command{filtered.length === 1 ? '' : 's'}
          </div>
          <div style={{ display: 'flex', gap: 14, color: 'var(--paper-faint)', fontSize: 11 }}>
            <FooterHint k="↑↓" label="Navigate" />
            <FooterHint k="↵" label="Run" />
            <FooterHint k="esc" label="Close" />
          </div>
        </div>
      </div>

      {/* Keyframes — scoped via a tag injection so we don't need a CSS file */}
      <style>{`
        @keyframes cmdkFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes cmdkRise {
          from { opacity: 0; transform: translate(-50%, 8px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </>
  );
}

function FooterHint({ k, label }: { k: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <kbd
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          padding: '1px 5px',
          background: 'var(--ink-700)',
          border: '1px solid var(--hairline)',
          borderRadius: 2,
          color: 'var(--paper-soft)',
        }}
      >
        {k}
      </kbd>
      <span>{label}</span>
    </span>
  );
}

function buildCommands({
  openPanel,
  toggleGlobe,
  openDatePicker,
  toggleThemedTimelines,
}: {
  openPanel: (panel: PanelId) => void;
  toggleGlobe: () => void;
  openDatePicker: () => void;
  toggleThemedTimelines: () => void;
}): Command[] {
  // Helper that returns a `run` function which opens a given panel.
  const open = (panel: PanelId) => () => openPanel(panel);

  return [
    // ── Navigate ──────────────────────────────────────────
    {
      id: 'jump',
      label: 'Jump to a date',
      hint: 'Type a year or pick an era',
      group: 'navigate',
      keywords: ['date', 'year', 'era', 'when', 'time'],
      run: openDatePicker,
    },
    {
      id: 'chat',
      label: 'Ask the guide',
      hint: 'AI history companion',
      group: 'navigate',
      keywords: ['ai', 'chat', 'help', 'question', 'guide'],
      run: open('chat'),
    },
    {
      id: 'search',
      label: 'Search events',
      hint: 'Find a person, place, or thing',
      group: 'navigate',
      keywords: ['find', 'search'],
      run: open('search'),
    },

    // ── Explore ───────────────────────────────────────────
    {
      id: 'globe',
      label: 'Toggle the globe',
      hint: 'Show or hide the 3D Earth',
      group: 'explore',
      keywords: ['earth', 'world', '3d', 'map'],
      run: toggleGlobe,
    },
    {
      id: 'today',
      label: 'Today in history',
      group: 'explore',
      keywords: ['day', 'date', 'on this day'],
      run: open('today'),
    },
    {
      id: 'places',
      label: 'History of a place',
      group: 'explore',
      keywords: ['city', 'country', 'location'],
      run: open('places'),
    },
    {
      id: 'parallels',
      label: 'Parallels to today',
      group: 'explore',
      keywords: ['current events', 'now'],
      run: open('currentEvents'),
    },
    {
      id: 'graph',
      label: 'Connection graph',
      group: 'explore',
      keywords: ['network', 'links'],
      run: open('graph'),
    },
    {
      id: 'figures',
      label: 'Talk to historical figures',
      group: 'explore',
      keywords: ['people', 'biography'],
      run: open('figures'),
    },
    {
      id: 'lenses',
      label: 'Apply a lens',
      hint: 'Filter the timeline by theme',
      group: 'explore',
      keywords: ['filter', 'theme', 'science', 'art'],
      run: open('lenses'),
    },
    {
      id: 'comparison',
      label: 'Compare regions',
      group: 'explore',
      keywords: ['compare', 'lanes', 'world'],
      run: open('comparison'),
    },
    {
      id: 'parallel-threads',
      label: 'Parallel themed timelines',
      hint: 'Weave science, art, war & more',
      group: 'explore',
      keywords: ['threads', 'parallel', 'theme', 'tracks', 'converge', 'weave'],
      run: toggleThemedTimelines,
    },
    {
      id: 'timelapse',
      label: 'Time-lapse mode',
      group: 'explore',
      keywords: ['animate', 'play', 'tour'],
      run: open('timelapse'),
    },
    {
      id: 'overlays',
      label: 'Data overlays',
      group: 'explore',
      keywords: ['population', 'climate', 'data'],
      run: open('overlays'),
    },

    // ── Learn ─────────────────────────────────────────────
    {
      id: 'myths',
      label: 'Myth vs reality',
      group: 'learn',
      keywords: ['truth', 'misconception'],
      run: open('myths'),
    },
    {
      id: 'quiz',
      label: 'Take a quiz',
      group: 'learn',
      keywords: ['test', 'game'],
      run: open('quiz'),
    },
    {
      id: 'review',
      label: 'Spaced review',
      group: 'learn',
      keywords: ['flashcards', 'memorize'],
      run: open('review'),
    },
    {
      id: 'reading',
      label: 'Reading list',
      group: 'learn',
      keywords: ['books', 'articles'],
      run: open('reading'),
    },
    {
      id: 'sources',
      label: 'Compare sources',
      group: 'learn',
      keywords: ['citation', 'verify'],
      run: open('sources'),
    },
    {
      id: 'difficulty',
      label: 'Set difficulty',
      hint: 'Kids · Standard · Advanced · Research',
      group: 'learn',
      keywords: ['level', 'kids', 'phd'],
      run: open('difficulty'),
    },
    {
      id: 'classroom',
      label: 'Classroom mode',
      group: 'learn',
      keywords: ['school', 'teacher'],
      run: open('classroom'),
    },
    {
      id: 'teacher',
      label: 'Teacher dashboard',
      group: 'learn',
      keywords: ['teach', 'school'],
      run: open('teacher'),
    },

    // ── Create ────────────────────────────────────────────
    {
      id: 'whatif',
      label: 'What if?',
      hint: 'Counterfactual history',
      group: 'create',
      keywords: ['alternate', 'speculate'],
      run: open('whatif'),
    },
    {
      id: 'debate',
      label: 'Stage a debate',
      group: 'create',
      run: open('debate'),
    },
    {
      id: 'personal',
      label: 'My life timeline',
      group: 'create',
      keywords: ['birthday', 'me'],
      run: open('personal'),
    },
    {
      id: 'community',
      label: 'Community hub',
      group: 'create',
      run: open('community'),
    },
    {
      id: 'collaboration',
      label: 'Live collaboration',
      group: 'create',
      keywords: ['multiplayer', 'share'],
      run: open('collaboration'),
    },
    {
      id: 'soundtrack',
      label: 'History soundtrack',
      group: 'create',
      keywords: ['music', 'audio'],
      run: open('soundtrack'),
    },
    {
      id: 'export',
      label: 'Export view',
      hint: 'PDF, image, or shareable link',
      group: 'create',
      keywords: ['download', 'share', 'print'],
      run: open('export'),
    },

    // ── System ────────────────────────────────────────────
    {
      id: 'account',
      label: 'Account',
      group: 'system',
      keywords: ['login', 'sign in', 'profile'],
      run: open('auth'),
    },
    {
      id: 'help',
      label: 'Keyboard shortcuts',
      group: 'system',
      keywords: ['shortcut', 'keys', '?'],
      run: open('help'),
    },
  ];
}
