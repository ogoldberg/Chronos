import type { Viewport } from '../types';
import { formatYear } from '../utils/format';
import { getEra } from '../data/eras';
import { useUIStore } from '../stores/uiStore';

interface Props {
  viewport: Viewport;
  /** Open the date picker popover. */
  onOpenDatePicker: () => void;
  /** Open the ⌘K command palette. */
  onOpenPalette: () => void;
}

/**
 * Editorial header — the only thing pinned to the top of Chronos.
 *
 * Three slots, single line:
 *
 *   CHRONOS                  Cenozoic · 2026 CE                  ⌘K
 *
 * The wordmark anchors the page in Fraunces. The middle is the live
 * "era · year" indicator, set typographically and clickable; clicking it
 * opens the date picker. The right slot is a single ⌘K affordance that
 * opens the command palette where every secondary feature lives.
 *
 * That's it. No era chips, no toolbar, no badges. Everything else
 * recedes into the canvas or hides behind the palette.
 */
export default function EditorialHeader({ viewport, onOpenDatePicker, onOpenPalette }: Props) {
  const era = getEra(viewport.centerYear);
  const yearLabel = formatYear(viewport.centerYear);
  const activeLens = useUIStore(s => s.activeLens);
  const setActiveLens = useUIStore(s => s.setActiveLens);

  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 56,
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        padding: '0 28px',
        zIndex: 30,
        // Subtle gradient: dark at the top, fading to nothing so the
        // canvas underneath shows through. Avoids a hard "header bar".
        background: 'linear-gradient(180deg, var(--ink-900) 0%, rgba(10,14,26,0.78) 60%, rgba(10,14,26,0) 100%)',
        pointerEvents: 'none',
      }}
    >
      {/* Left: wordmark */}
      <div style={{ pointerEvents: 'auto' }}>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 500,
            letterSpacing: '0.18em',
            color: 'var(--paper)',
            fontVariationSettings: '"opsz" 144, "SOFT" 50',
          }}
        >
          CHRONOS
        </span>
      </div>

      {/* Center: era + year. Clickable typographic block. */}
      <button
        onClick={onOpenDatePicker}
        title="Jump to a specific date or era"
        data-onboard="era-indicator"
        style={{
          pointerEvents: 'auto',
          background: 'transparent',
          border: 'none',
          padding: '8px 18px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'baseline',
          gap: 14,
          color: 'var(--paper)',
          textDecoration: 'none',
          borderBottom: '1px solid transparent',
          transition: 'border-color 200ms var(--ease-out)',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.borderBottomColor = 'var(--ember-soft)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.borderBottomColor = 'transparent';
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 13,
            fontWeight: 400,
            fontStyle: 'italic',
            letterSpacing: '0.04em',
            color: 'var(--paper-mute)',
            fontVariationSettings: '"opsz" 14',
          }}
        >
          {era.label}
        </span>
        <span
          style={{
            width: 1,
            height: 14,
            background: 'var(--paper-ghost)',
            display: 'inline-block',
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 17,
            fontWeight: 500,
            letterSpacing: '0.01em',
            color: 'var(--paper)',
            fontVariationSettings: '"opsz" 144',
          }}
        >
          {yearLabel}
        </span>
      </button>

      {/* Right: active lens chip (if any) + ⌘K affordance */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, pointerEvents: 'auto' }}>
        {activeLens && (
          <div
            title={`Active lens: ${activeLens.name}. Click \u2715 to clear.`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 10px 5px 12px',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontSize: 12,
              letterSpacing: '0.04em',
              color: 'var(--paper-mute)',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: activeLens.color, display: 'inline-block' }} />
            <span>{activeLens.name}</span>
            <button
              onClick={() => setActiveLens(null)}
              aria-label="Clear lens"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--paper-ghost)',
                cursor: 'pointer',
                padding: 0,
                marginLeft: 2,
                fontSize: 13,
                lineHeight: 1,
              }}
            >
              &times;
            </button>
          </div>
        )}
        <button
          onClick={onOpenPalette}
          title="Open command palette"
          data-onboard="palette"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '7px 12px 7px 14px',
            background: 'transparent',
            border: '1px solid var(--hairline)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--paper-mute)',
            cursor: 'pointer',
            fontFamily: 'var(--font-ui)',
            fontSize: 12,
            letterSpacing: '0.04em',
            transition: 'border-color 180ms var(--ease-out), color 180ms var(--ease-out)',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.borderColor = 'var(--hairline-strong)';
            el.style.color = 'var(--paper)';
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.borderColor = 'var(--hairline)';
            el.style.color = 'var(--paper-mute)';
          }}
        >
          <span>Search</span>
          <kbd
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              padding: '2px 6px',
              background: 'var(--ink-700)',
              border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--paper-soft)',
            }}
          >
            ⌘K
          </kbd>
        </button>
      </div>
    </header>
  );
}
