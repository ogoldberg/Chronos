import { useState, useEffect, useRef, useCallback } from 'react';
import { recordQuizAnswer, getStats } from './gamification';
import { addReviewCard } from './spacedRepetition';

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface Props {
  recentEvents?: string[];
  era?: string;
  onClose?: () => void;
}

const TIMER_SECONDS = 15;

export default function QuizPanel({ recentEvents = [], era = 'modern', onClose }: Props) {
  const [open, setOpen] = useState(true);
  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const [streak, setStreak] = useState(() => getStats().quizStreak);
  const [xpEarned, setXpEarned] = useState(0);
  const [sessionXP, setSessionXP] = useState(0);
  const [error, setError] = useState('');
  const [fireAnim, setFireAnim] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const fetchQuestion = useCallback(async () => {
    setLoading(true);
    setError('');
    setSelected(null);
    setRevealed(false);
    setTimeLeft(TIMER_SECONDS);
    setXpEarned(0);
    stopTimer();

    try {
      const resp = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: recentEvents.slice(0, 10), era }),
      });

      if (resp.status === 429) {
        setError('Too many requests — wait a moment and try again.');
        setLoading(false);
        return;
      }

      const data = await resp.json();
      if (data.error) {
        setError(data.error);
        setLoading(false);
        return;
      }

      setQuestion(data);
      setLoading(false);

      // Start countdown
      timerRef.current = setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) {
            stopTimer();
            // Time's up — auto-reveal
            setRevealed(true);
            const stats = recordQuizAnswer(false);
            setStreak(stats.quizStreak);
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    } catch {
      setError('Failed to load question. Check your connection.');
      setLoading(false);
    }
  }, [recentEvents, era, stopTimer]);

  // Cleanup timer on unmount
  useEffect(() => stopTimer, [stopTimer]);

  const handleSelect = (idx: number) => {
    if (revealed || selected !== null) return;
    stopTimer();
    setSelected(idx);
    setRevealed(true);

    const correct = question ? idx === question.correctIndex : false;
    const prevStats = getStats();
    const stats = recordQuizAnswer(correct);
    setStreak(stats.quizStreak);

    if (correct && question) {
      const earned = stats.xp - prevStats.xp;
      setXpEarned(earned);
      setSessionXP((s) => s + earned);
      setFireAnim(true);
      setTimeout(() => setFireAnim(false), 600);

      // Add to spaced repetition deck
      addReviewCard({
        id: `quiz-${Date.now()}`,
        eventTitle: question.question.slice(0, 60),
        eventYear: new Date().getFullYear(),
        question: question.question,
        answer: `${question.options[question.correctIndex]}. ${question.explanation}`,
      });
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); fetchQuestion(); }}
        style={{
          position: 'absolute',
          bottom: 80,
          right: 20,
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'rgba(13, 17, 23, 0.9)',
          border: '1px solid rgba(255,255,255,0.15)',
          color: '#fff',
          fontSize: 22,
          cursor: 'pointer',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          zIndex: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.2s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        title="Quiz"
      >
        {'\ud83e\udde0'}
      </button>
    );
  }

  const optionColors = (idx: number) => {
    if (!revealed) {
      return {
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: '#ffffffcc',
      };
    }
    if (question && idx === question.correctIndex) {
      return {
        background: 'rgba(34, 197, 94, 0.15)',
        border: '1px solid rgba(34, 197, 94, 0.5)',
        color: '#22c55e',
        boxShadow: '0 0 12px rgba(34, 197, 94, 0.2)',
      };
    }
    if (idx === selected) {
      return {
        background: 'rgba(239, 68, 68, 0.15)',
        border: '1px solid rgba(239, 68, 68, 0.5)',
        color: '#ef4444',
        boxShadow: '0 0 12px rgba(239, 68, 68, 0.2)',
      };
    }
    return {
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.05)',
      color: '#ffffff50',
    };
  };

  return (
    <div style={{
      position: 'absolute',
      bottom: 20,
      right: 80,
      width: 380,
      maxWidth: 'calc(100vw - 100px)',
      background: 'rgba(10, 14, 22, 0.95)',
      borderRadius: 16,
      border: '1px solid rgba(255,255,255,0.08)',
      backdropFilter: 'blur(20px)',
      boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
      zIndex: 45,
      overflow: 'hidden',
      animation: 'panelSlideUp 0.25s ease-out',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{ fontSize: 18 }}>{'\ud83e\udde0'}</span>
        <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, flex: 1 }}>Timeline Quiz</span>
        {/* Streak */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          color: streak > 0 ? '#f59e0b' : '#ffffff40',
          fontSize: 12, fontWeight: 600,
          transition: 'transform 0.3s',
          transform: fireAnim ? 'scale(1.3)' : 'scale(1)',
        }}>
          {streak > 0 && <span>{'\ud83d\udd25'}</span>}
          <span>{streak}</span>
        </div>
        {/* Session XP */}
        <div style={{
          fontSize: 10, color: '#a78bfa', fontFamily: 'monospace',
          background: 'rgba(167, 139, 250, 0.1)',
          padding: '2px 8px', borderRadius: 8,
        }}>
          +{sessionXP} XP
        </div>
        <button
          onClick={() => { setOpen(false); stopTimer(); onClose?.(); }}
          style={{
            background: 'none', border: 'none', color: '#ffffff60',
            fontSize: 16, cursor: 'pointer', padding: 2,
          }}
        >{'\u2715'}</button>
      </div>

      {/* Body */}
      <div style={{ padding: '16px' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#ffffff50', fontSize: 13 }}>
            Generating question...
          </div>
        )}

        {error && (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</div>
            <button
              onClick={fetchQuestion}
              style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, padding: '6px 16px', color: '#ffffffaa', fontSize: 12, cursor: 'pointer',
              }}
            >Retry</button>
          </div>
        )}

        {question && !loading && !error && (
          <>
            {/* Timer bar */}
            <div style={{
              height: 3, borderRadius: 2, marginBottom: 14,
              background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 2,
                width: `${(timeLeft / TIMER_SECONDS) * 100}%`,
                background: timeLeft <= 5
                  ? 'linear-gradient(90deg, #ef4444, #f59e0b)'
                  : 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
                transition: 'width 1s linear',
              }} />
            </div>

            {/* Timer text */}
            <div style={{
              textAlign: 'right', fontSize: 11, fontFamily: 'monospace',
              color: timeLeft <= 5 ? '#ef4444' : '#ffffff40', marginBottom: 10,
            }}>
              {timeLeft}s
            </div>

            {/* Question */}
            <div style={{
              color: '#ffffffdd', fontSize: 14, lineHeight: 1.5,
              marginBottom: 16, fontWeight: 500,
            }}>
              {question.question}
            </div>

            {/* Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {question.options.map((opt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelect(idx)}
                  disabled={revealed}
                  style={{
                    ...optionColors(idx),
                    borderRadius: 10,
                    padding: '10px 14px',
                    textAlign: 'left',
                    fontSize: 13,
                    cursor: revealed ? 'default' : 'pointer',
                    transition: 'all 0.2s',
                    lineHeight: 1.4,
                  }}
                >
                  <span style={{ opacity: 0.4, marginRight: 8, fontSize: 11 }}>
                    {String.fromCharCode(65 + idx)}.
                  </span>
                  {opt}
                </button>
              ))}
            </div>

            {/* Explanation + XP + Next */}
            {revealed && (
              <div style={{ marginTop: 14 }}>
                <div style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 8, padding: '10px 12px',
                  color: '#ffffffaa', fontSize: 12, lineHeight: 1.5,
                  marginBottom: 12,
                }}>
                  {question.explanation}
                </div>

                {xpEarned > 0 && (
                  <div style={{
                    textAlign: 'center', color: '#a78bfa', fontSize: 13,
                    fontWeight: 600, marginBottom: 10,
                  }}>
                    +{xpEarned} XP earned!
                  </div>
                )}

                <button
                  onClick={fetchQuestion}
                  style={{
                    width: '100%',
                    background: 'rgba(59, 130, 246, 0.15)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: 10, padding: '10px 0',
                    color: '#60a5fa', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(59,130,246,0.25)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(59,130,246,0.15)'; }}
                >
                  Next Question {'\u2192'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
