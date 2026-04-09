import { useEffect, useRef, useState } from 'react';
import { useTimelineStore, type ProposedThread } from '../../stores/timelineStore';
import { getVisibleRange } from '../../canvas/viewport';
import type { TimelineEvent, Viewport } from '../../types';

/**
 * Conversational modal for proposing a convergence the system didn't
 * detect. The user types a hypothesis ("jazz and civil rights are
 * entangled"), the server route `/api/threads/propose` asks the AI to
 * validate and break it into concrete event-to-event threads, and the
 * user accepts or rejects each one.
 *
 * Accepted threads flow into `proposedThreads` on the timeline store
 * and the canvas renderer paints them as amber arcs on top of whatever
 * layout is active — they work in both normal mode and themed mode.
 */
interface Props {
  onClose: () => void;
  viewport: Viewport;
  visibleEvents: TimelineEvent[];
}

interface ServerThread {
  fromTitle: string;
  toTitle: string;
  fromYear?: number;
  toYear?: number;
  relationship: string;
  label: string;
  explanation: string;
  confidence: 'high' | 'medium' | 'low';
  valid: boolean;
}

interface ServerResponse {
  summary: string;
  threads: ServerThread[];
}

export default function ProposeConvergenceModal({ onClose, viewport, visibleEvents }: Props) {
  const [hypothesis, setHypothesis] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<ServerResponse | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const addProposedThreads = useTimelineStore(s => s.addProposedThreads);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  async function ask() {
    const h = hypothesis.trim();
    if (!h) return;
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const [startYear, endYear] = getVisibleRange(viewport);
      const titles = visibleEvents.slice(0, 80).map(e => e.title);
      const resp = await fetch('/api/threads/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hypothesis: h,
          visibleEventTitles: titles,
          startYear: Math.round(startYear),
          endYear: Math.round(endYear),
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as ServerResponse;
      setResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  function accept(thread: ServerThread) {
    const id = `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const entry: ProposedThread = {
      id,
      fromTitle: thread.fromTitle,
      toTitle: thread.toTitle,
      fromYear: thread.fromYear,
      toYear: thread.toYear,
      relationship: thread.relationship,
      label: thread.label,
      explanation: thread.explanation,
      confidence: thread.confidence,
      hypothesis,
    };
    addProposedThreads([entry]);
    // Strike the accepted thread out of the response so the user sees
    // what they've already added without it disappearing entirely.
    setResponse(prev => prev ? {
      ...prev,
      threads: prev.threads.map(t =>
        t === thread ? { ...t, label: t.label + ' · added' } : t,
      ),
    } : prev);
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
        aria-label="Propose a convergence"
        style={{
          position: 'fixed',
          top: '12vh',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(600px, 92vw)',
          maxHeight: '76vh',
          background: 'var(--ink-800, #0d1117)',
          border: '1px solid var(--hairline-strong, rgba(244,236,216,0.12))',
          borderRadius: 14,
          padding: '22px 24px',
          zIndex: 91,
          boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
          color: 'var(--paper, #f5f1e8)',
          fontFamily: 'var(--font-ui, -apple-system, sans-serif)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
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
          Propose a convergence
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display, Georgia, serif)',
            fontStyle: 'italic',
            fontSize: 12,
            color: 'rgba(255,255,255,0.5)',
            marginBottom: 14,
            lineHeight: 1.5,
          }}
        >
          Describe a connection you think exists between events or themes.
          I'll check it against the record and draw any threads that hold up.
        </div>

        <textarea
          ref={inputRef}
          value={hypothesis}
          onChange={e => setHypothesis(e.target.value)}
          placeholder="e.g. The printing press sparked the Protestant Reformation, which fractured European politics for a century."
          rows={3}
          style={{
            width: '100%',
            padding: '12px 14px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10,
            color: 'var(--paper, #f5f1e8)',
            fontSize: 14,
            fontFamily: 'inherit',
            outline: 'none',
            resize: 'vertical',
            minHeight: 72,
            lineHeight: 1.5,
          }}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 12,
            gap: 12,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display, Georgia, serif)',
              fontStyle: 'italic',
              fontSize: 11,
              color: 'rgba(255,255,255,0.35)',
            }}
          >
            The AI will only draw threads it can defend historically.
          </div>
          <button
            onClick={ask}
            disabled={loading || !hypothesis.trim()}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: '1px solid #f6b73c',
              background: '#f6b73c',
              color: '#0a0d14',
              fontSize: 12,
              fontWeight: 600,
              cursor: loading || !hypothesis.trim() ? 'default' : 'pointer',
              opacity: loading || !hypothesis.trim() ? 0.5 : 1,
              fontFamily: 'inherit',
            }}
          >
            {loading ? 'Checking…' : 'Ask the AI'}
          </button>
        </div>

        {error && (
          <div
            style={{
              marginTop: 16,
              padding: '10px 12px',
              background: 'rgba(255,80,80,0.08)',
              border: '1px solid rgba(255,80,80,0.25)',
              borderRadius: 8,
              fontSize: 12,
              color: '#ff9999',
            }}
          >
            {error}
          </div>
        )}

        {response && (
          <div
            style={{
              marginTop: 18,
              flex: 1,
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-display, Georgia, serif)',
                fontStyle: 'italic',
                fontSize: 13,
                color: 'rgba(255,255,255,0.75)',
                lineHeight: 1.55,
                marginBottom: 14,
                padding: '12px 14px',
                background: 'rgba(246,183,60,0.06)',
                borderLeft: '2px solid #f6b73c',
                borderRadius: '0 8px 8px 0',
              }}
            >
              {response.summary || 'The AI returned no summary.'}
            </div>

            {response.threads.length === 0 ? (
              <div
                style={{
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.45)',
                  fontStyle: 'italic',
                }}
              >
                Nothing concrete to draw — the AI couldn't validate a specific event-to-event thread. Try naming the events you have in mind directly.
              </div>
            ) : (
              response.threads.map((t, i) => (
                <ThreadCard
                  key={i}
                  thread={t}
                  onAccept={() => accept(t)}
                />
              ))
            )}
          </div>
        )}
      </div>
    </>
  );
}

function ThreadCard({
  thread,
  onAccept,
}: {
  thread: ServerThread;
  onAccept: () => void;
}) {
  const color = thread.valid
    ? (thread.confidence === 'high' ? '#2ecc71' : thread.confidence === 'medium' ? '#f6b73c' : '#999')
    : '#ff6666';
  return (
    <div
      style={{
        marginBottom: 10,
        padding: '12px 14px',
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${color}55`,
        borderRadius: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 6,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--paper, #f5f1e8)' }}>
          {thread.fromTitle}
        </span>
        <span style={{ fontSize: 11, color: color, fontStyle: 'italic' }}>
          — {thread.label || thread.relationship} →
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--paper, #f5f1e8)' }}>
          {thread.toTitle}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 9,
            letterSpacing: '0.08em',
            padding: '2px 6px',
            borderRadius: 4,
            background: color + '22',
            color: color,
            textTransform: 'uppercase',
          }}
        >
          {thread.valid ? thread.confidence : 'rejected'}
        </span>
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display, Georgia, serif)',
          fontStyle: 'italic',
          fontSize: 12,
          color: 'rgba(255,255,255,0.7)',
          lineHeight: 1.5,
          marginBottom: 10,
        }}
      >
        {thread.explanation}
      </div>
      {thread.valid && (
        <button
          onClick={onAccept}
          style={{
            padding: '5px 12px',
            borderRadius: 6,
            border: `1px solid ${color}`,
            background: color + '22',
            color: color,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Draw thread
        </button>
      )}
    </div>
  );
}
