import { useState, useEffect, useCallback, type CSSProperties } from 'react';

const STORAGE_KEY = 'chronos_onboarded';

interface TutorialStep {
  target: string;
  text: string;
  arrowDirection: 'up' | 'down' | 'left' | 'right';
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    target: 'canvas',
    text: 'Scroll to zoom in and out. Drag to pan through time.',
    arrowDirection: 'down',
  },
  {
    target: '.era-chips, [class*="era-chip"], [class*="EraChip"]',
    text: 'Jump to any era with these quick-nav buttons.',
    arrowDirection: 'up',
  },
  {
    target: '[class*="chat"], button:has(> :first-child)',
    text: 'Ask me anything about history. I\'ll take you there.',
    arrowDirection: 'up',
  },
  {
    target: '.globe-toggle',
    text: 'See where events happened on the 3D globe.',
    arrowDirection: 'left',
  },
  {
    target: '[style*="bottom: 20px"]',
    text: 'Explore quizzes, myths, debates, and more.',
    arrowDirection: 'up',
  },
];

function getTargetRect(step: TutorialStep, stepIndex: number): DOMRect | null {
  // Step 0 targets the canvas element
  if (stepIndex === 0) {
    const el = document.querySelector('canvas');
    return el?.getBoundingClientRect() ?? null;
  }
  // Step 4 targets the bottom toolbar
  if (stepIndex === 4) {
    const toolbar = document.querySelector('[style*="bottom"]');
    // Find the bottom toolbar more reliably
    const allDivs = document.querySelectorAll('.chronos-root > div');
    for (const div of allDivs) {
      const style = (div as HTMLElement).style;
      if (style.bottom === '20px' && style.display === 'flex') {
        return div.getBoundingClientRect();
      }
    }
    return toolbar?.getBoundingClientRect() ?? null;
  }
  // Step 3 targets globe toggle
  if (stepIndex === 3) {
    const el = document.querySelector('.globe-toggle');
    return el?.getBoundingClientRect() ?? null;
  }
  // Step 1 targets era chips
  if (stepIndex === 1) {
    // EraChips is typically positioned at the bottom-left area
    const selectors = step.target.split(', ');
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) return el.getBoundingClientRect();
      } catch { /* skip invalid selectors */ }
    }
    return null;
  }
  // Step 2 targets chat button
  if (stepIndex === 2) {
    // Find the chat button in the bottom toolbar
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent?.includes('Chat')) {
        return btn.getBoundingClientRect();
      }
    }
    return null;
  }
  return null;
}

/* ── Styles ── */
const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  background: 'rgba(0, 0, 0, 0.75)',
  backdropFilter: 'blur(4px)',
  transition: 'opacity 0.4s ease',
};

const welcomeContainerStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 10000,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 16,
};

const titleStyle: CSSProperties = {
  fontSize: 48,
  fontWeight: 700,
  color: '#ffffff',
  letterSpacing: '-0.5px',
  textAlign: 'center',
  margin: 0,
};

const subtitleStyle: CSSProperties = {
  fontSize: 18,
  color: 'rgba(255, 255, 255, 0.5)',
  textAlign: 'center',
  margin: '0 0 32px',
  fontWeight: 400,
};

const startBtnStyle: CSSProperties = {
  padding: '14px 40px',
  fontSize: 16,
  fontWeight: 600,
  background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
  color: '#fff',
  border: 'none',
  borderRadius: 14,
  cursor: 'pointer',
  transition: 'transform 0.2s, box-shadow 0.2s',
  boxShadow: '0 4px 24px rgba(59, 130, 246, 0.35)',
};

const skipLinkStyle: CSSProperties = {
  marginTop: 16,
  background: 'none',
  border: 'none',
  color: 'rgba(255, 255, 255, 0.3)',
  fontSize: 13,
  cursor: 'pointer',
  textDecoration: 'underline',
  padding: '4px 8px',
};

const tooltipCardStyle: CSSProperties = {
  position: 'fixed',
  zIndex: 10001,
  background: 'rgba(10, 14, 22, 0.94)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: 16,
  backdropFilter: 'blur(20px)',
  boxShadow: '0 8px 40px rgba(0, 0, 0, 0.5)',
  padding: '20px 24px',
  maxWidth: 340,
  minWidth: 260,
  transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
};

const tooltipTextStyle: CSSProperties = {
  color: 'rgba(255, 255, 255, 0.85)',
  fontSize: 14,
  lineHeight: 1.6,
  margin: '0 0 18px',
};

const tooltipButtonRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
};

const nextBtnStyle: CSSProperties = {
  padding: '8px 22px',
  fontSize: 13,
  fontWeight: 600,
  background: 'rgba(59, 130, 246, 0.9)',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  cursor: 'pointer',
  transition: 'background 0.2s',
};

const skipBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'rgba(255, 255, 255, 0.3)',
  fontSize: 12,
  cursor: 'pointer',
  padding: '4px 8px',
};

const dotsContainerStyle: CSSProperties = {
  display: 'flex',
  gap: 6,
  alignItems: 'center',
};

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div style={dotsContainerStyle}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{
            width: i === current ? 18 : 6,
            height: 6,
            borderRadius: 3,
            background: i === current ? '#3b82f6' : 'rgba(255, 255, 255, 0.15)',
            transition: 'all 0.3s ease',
          }}
        />
      ))}
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginLeft: 8 }}>
        {current + 1}/{total}
      </span>
    </div>
  );
}

function SpotlightOverlay({ rect }: { rect: DOMRect | null }) {
  if (!rect) {
    return <div style={backdropStyle} />;
  }

  const pad = 12;
  const x = rect.left - pad;
  const y = rect.top - pad;
  const w = rect.width + pad * 2;
  const h = rect.height + pad * 2;
  const r = 12;

  return (
    <svg
      style={{ position: 'fixed', inset: 0, zIndex: 9999, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      <defs>
        <mask id="onboarding-spotlight">
          <rect width="100%" height="100%" fill="white" />
          <rect x={x} y={y} width={w} height={h} rx={r} ry={r} fill="black" />
        </mask>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill="rgba(0, 0, 0, 0.75)"
        mask="url(#onboarding-spotlight)"
        style={{ backdropFilter: 'blur(4px)' }}
      />
      {/* Spotlight border glow */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={r}
        ry={r}
        fill="none"
        stroke="rgba(59, 130, 246, 0.3)"
        strokeWidth={2}
      >
        <animate attributeName="stroke-opacity" values="0.3;0.6;0.3" dur="2s" repeatCount="indefinite" />
      </rect>
    </svg>
  );
}

function ArrowPointer({ direction, style }: { direction: string; style?: CSSProperties }) {
  const arrowChar =
    direction === 'up' ? '↑' :
    direction === 'down' ? '↓' :
    direction === 'left' ? '←' : '→';

  return (
    <span
      style={{
        fontSize: 22,
        color: '#3b82f6',
        display: 'inline-block',
        animation: 'onboardingBounce 1.2s ease-in-out infinite',
        ...style,
      }}
    >
      {arrowChar}
    </span>
  );
}

function getTooltipPosition(
  rect: DOMRect | null,
  arrowDirection: string,
): CSSProperties {
  if (!rect) {
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }

  const pad = 20;
  switch (arrowDirection) {
    case 'down':
      return {
        top: rect.top - pad,
        left: rect.left + rect.width / 2,
        transform: 'translate(-50%, -100%)',
      };
    case 'up':
      return {
        top: rect.bottom + pad,
        left: Math.min(rect.left + rect.width / 2, window.innerWidth - 200),
        transform: 'translateX(-50%)',
      };
    case 'left':
      return {
        top: rect.top + rect.height / 2,
        left: rect.left - pad,
        transform: 'translate(-100%, -50%)',
      };
    case 'right':
      return {
        top: rect.top + rect.height / 2,
        left: rect.right + pad,
        transform: 'translateY(-50%)',
      };
    default:
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }
}

type Phase = 'welcome' | 'tutorial' | 'done';

export const ONBOARDING_RESET_EVENT = 'chronos-reset-onboarding';

export default function OnboardingOverlay() {
  const [phase, setPhase] = useState<Phase>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ? 'done' : 'welcome';
    } catch {
      return 'welcome';
    }
  });
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const complete = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch { /* storage full or blocked */ }
    setPhase('done');
  }, []);

  const startTutorial = useCallback(() => {
    setStepIndex(0);
    setPhase('tutorial');
  }, []);

  const nextStep = useCallback(() => {
    if (stepIndex >= TUTORIAL_STEPS.length - 1) {
      complete();
    } else {
      setStepIndex(prev => prev + 1);
    }
  }, [stepIndex, complete]);

  // Listen for re-trigger from "Show me around" button
  useEffect(() => {
    const handler = () => {
      setStepIndex(0);
      setPhase('tutorial');
    };
    window.addEventListener(ONBOARDING_RESET_EVENT, handler);
    return () => window.removeEventListener(ONBOARDING_RESET_EVENT, handler);
  }, []);

  // Measure target element position whenever step changes
  useEffect(() => {
    if (phase !== 'tutorial') return;

    const measure = () => {
      const rect = getTargetRect(TUTORIAL_STEPS[stepIndex], stepIndex);
      setTargetRect(rect);
    };

    // Measure immediately and on resize
    measure();
    window.addEventListener('resize', measure);
    // Re-measure after a short delay for layout shifts
    const timer = setTimeout(measure, 100);
    return () => {
      window.removeEventListener('resize', measure);
      clearTimeout(timer);
    };
  }, [phase, stepIndex]);

  // Inject keyframe animation on mount
  useEffect(() => {
    const id = 'onboarding-keyframes';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      @keyframes onboardingBounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-6px); }
      }
      @keyframes onboardingFadeIn {
        from { opacity: 0; transform: scale(0.96); }
        to { opacity: 1; transform: scale(1); }
      }
    `;
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById(id);
      if (el) el.remove();
    };
  }, []);

  if (phase === 'done') return null;

  if (phase === 'welcome') {
    return (
      <>
        <div style={backdropStyle} />
        <div style={welcomeContainerStyle} data-testid="onboarding-welcome">
          <h1 style={titleStyle}>Welcome to CHRONOS</h1>
          <p style={subtitleStyle}>13.8 billion years of history at your fingertips</p>
          <button
            style={startBtnStyle}
            onClick={startTutorial}
            data-testid="onboarding-start"
          >
            Start Exploring
          </button>
          <button
            style={skipLinkStyle}
            onClick={complete}
            data-testid="onboarding-skip"
          >
            Skip
          </button>
        </div>
      </>
    );
  }

  // Tutorial phase
  const step = TUTORIAL_STEPS[stepIndex];
  const pos = getTooltipPosition(targetRect, step.arrowDirection);

  return (
    <>
      <SpotlightOverlay rect={targetRect} />
      {/*
        Click catcher: dismisses the tutorial when the user clicks anywhere
        outside the tooltip. Previously this was a no-op div that just called
        stopPropagation, which made the entire page unclickable for the
        duration of the tutorial.
      */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'transparent' }}
        onClick={complete}
        data-testid="onboarding-click-catcher"
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...tooltipCardStyle,
          ...pos,
          animation: 'onboardingFadeIn 0.3s ease-out',
        }}
        data-testid="onboarding-tooltip"
      >
        <div style={{ marginBottom: 8 }}>
          <ArrowPointer direction={step.arrowDirection} />
        </div>
        <p style={tooltipTextStyle}>{step.text}</p>
        <div style={tooltipButtonRowStyle}>
          <ProgressDots current={stepIndex} total={TUTORIAL_STEPS.length} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              style={skipBtnStyle}
              onClick={complete}
              data-testid="onboarding-skip-step"
            >
              Skip
            </button>
            <button
              style={nextBtnStyle}
              onClick={nextStep}
              data-testid="onboarding-next"
            >
              {stepIndex === TUTORIAL_STEPS.length - 1 ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Dispatches an event to re-trigger the onboarding tutorial.
 * Can be called from any component (e.g. the help overlay's "Show me around" button).
 */
export function triggerOnboarding(): void {
  window.dispatchEvent(new CustomEvent(ONBOARDING_RESET_EVENT));
}

/**
 * Stateless trigger component for help panel.
 */
export function ShowMeAroundButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        marginTop: 12,
        background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(99,102,241,0.15))',
        border: '1px solid rgba(59, 130, 246, 0.3)',
        borderRadius: 10,
        color: '#3b82f6',
        padding: '8px 18px',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s',
        width: '100%',
      }}
      data-testid="show-me-around"
    >
      Show me around
    </button>
  );
}
