import { useState, useEffect, useCallback } from 'react';
import {
  getDueCards,
  reviewCard,
  getReviewStats,
  completeReviewSession,
  getNextReviewTime,
} from './spacedRepetition';
import type { ReviewCard } from './spacedRepetition';
import { addXP } from './gamification';

interface Props {
  onClose?: () => void;
}

const XP_PER_REVIEW = 10;
const XP_SESSION_BONUS = 50;

export default function ReviewPanel({ onClose }: Props) {
  const [dueCards, setDueCards] = useState<ReviewCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [sessionXP, setSessionXP] = useState(0);
  const [stats, setStats] = useState(() => getReviewStats());
  const [nextReview, setNextReview] = useState<number | null>(null);

  const totalDue = dueCards.length + completed;

  useEffect(() => {
    const cards = getDueCards();
    setDueCards(cards);
    setStats(getReviewStats());
    if (cards.length === 0) {
      setNextReview(getNextReviewTime());
    }
  }, []);

  const handleRate = useCallback((quality: number) => {
    const card = dueCards[currentIndex];
    if (!card) return;

    reviewCard(card.id, quality);
    addXP(XP_PER_REVIEW);
    setSessionXP(prev => prev + XP_PER_REVIEW);

    const remaining = dueCards.filter((_, i) => i !== currentIndex);
    setCompleted(prev => prev + 1);
    setDueCards(remaining);

    if (remaining.length === 0) {
      // Session complete
      completeReviewSession();
      addXP(XP_SESSION_BONUS);
      setSessionXP(prev => prev + XP_SESSION_BONUS);
      setStats(getReviewStats());
      setNextReview(getNextReviewTime());
    } else {
      setCurrentIndex(0);
    }

    setRevealed(false);
  }, [dueCards, currentIndex]);

  const formatTimeUntil = (timestamp: number): string => {
    const diff = timestamp - Date.now();
    if (diff <= 0) return 'now';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) return `${Math.floor(hours / 24)}d`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const currentCard = dueCards[currentIndex];
  const isDone = dueCards.length === 0;

  return (
    <div style={{
      position: 'absolute',
      bottom: 20,
      right: 80,
      width: 400,
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
        <span style={{ fontSize: 18 }}>{'\ud83d\udcda'}</span>
        <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, flex: 1 }}>Spaced Review</span>
        {/* Streak */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          color: stats.streak > 0 ? '#f59e0b' : '#ffffff40',
          fontSize: 12, fontWeight: 600,
        }}>
          {stats.streak > 0 && <span>{'\ud83d\udd25'}</span>}
          <span>{stats.streak}d streak</span>
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
          onClick={onClose}
          style={{
            background: 'none', border: 'none', color: '#ffffff60',
            fontSize: 16, cursor: 'pointer', padding: 2,
          }}
        >{'\u2715'}</button>
      </div>

      {/* Progress bar */}
      {totalDue > 0 && (
        <div style={{ padding: '8px 16px 0' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 11, color: '#ffffff60', marginBottom: 4,
          }}>
            <span>{completed} / {totalDue} completed</span>
            <span>{stats.totalCards} total cards</span>
          </div>
          <div style={{
            height: 4, borderRadius: 2,
            background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 2,
              width: totalDue > 0 ? `${(completed / totalDue) * 100}%` : '0%',
              background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      )}

      {/* Body */}
      <div style={{ padding: 16 }}>
        {isDone && completed === 0 && stats.totalCards === 0 && (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>{'\ud83c\udf31'}</div>
            <div style={{ color: '#ffffffcc', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
              No review cards yet
            </div>
            <div style={{ color: '#ffffff60', fontSize: 12, lineHeight: 1.5 }}>
              Answer quiz questions correctly or reveal myths to build your review deck.
            </div>
          </div>
        )}

        {isDone && completed === 0 && stats.totalCards > 0 && (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>{'\u2705'}</div>
            <div style={{ color: '#ffffffcc', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
              No reviews due!
            </div>
            <div style={{ color: '#ffffff60', fontSize: 12, lineHeight: 1.5 }}>
              {nextReview
                ? `Next review in ${formatTimeUntil(nextReview)}`
                : 'Check back later for new reviews.'
              }
            </div>
            <div style={{ color: '#ffffff40', fontSize: 11, marginTop: 8 }}>
              {stats.totalCards} card{stats.totalCards !== 1 ? 's' : ''} in your deck
            </div>
          </div>
        )}

        {isDone && completed > 0 && (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>{'\ud83c\udf89'}</div>
            <div style={{ color: '#ffffffcc', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
              Session complete!
            </div>
            <div style={{ color: '#a78bfa', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              +{sessionXP} XP earned
            </div>
            <div style={{ color: '#ffffff60', fontSize: 12, lineHeight: 1.5 }}>
              You reviewed {completed} card{completed !== 1 ? 's' : ''}.
              {nextReview
                ? ` Next review in ${formatTimeUntil(nextReview)}.`
                : ''
              }
            </div>
            {stats.streak > 0 && (
              <div style={{
                color: '#f59e0b', fontSize: 12, fontWeight: 600, marginTop: 8,
              }}>
                {'\ud83d\udd25'} {stats.streak} day streak!
              </div>
            )}
          </div>
        )}

        {currentCard && !isDone && (
          <>
            {/* Due count */}
            <div style={{
              color: '#60a5fa', fontSize: 13, fontWeight: 500,
              marginBottom: 12, textAlign: 'center',
            }}>
              You have {dueCards.length} review{dueCards.length !== 1 ? 's' : ''} due today!
            </div>

            {/* Flashcard */}
            <div style={{
              background: revealed
                ? 'rgba(34, 197, 94, 0.08)'
                : 'rgba(59, 130, 246, 0.08)',
              border: `1px solid ${revealed
                ? 'rgba(34, 197, 94, 0.3)'
                : 'rgba(59, 130, 246, 0.3)'}`,
              borderRadius: 12,
              padding: 16,
              marginBottom: 14,
              minHeight: 120,
              transition: 'all 0.3s ease',
            }}>
              {/* Event context */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                marginBottom: 10,
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px',
                  borderRadius: 6, letterSpacing: 0.5,
                  background: revealed
                    ? 'rgba(34, 197, 94, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                  color: revealed ? '#86efac' : '#93c5fd',
                }}>
                  {revealed ? 'ANSWER' : 'QUESTION'}
                </span>
                <span style={{ fontSize: 11, color: '#ffffff50', fontFamily: 'monospace' }}>
                  {currentCard.eventTitle} ({currentCard.eventYear < 0
                    ? `${Math.abs(currentCard.eventYear)} BCE`
                    : `${currentCard.eventYear} CE`})
                </span>
              </div>

              {/* Question */}
              <p style={{
                color: '#ffffffdd', fontSize: 14, lineHeight: 1.5,
                margin: 0, fontWeight: 500,
              }}>
                {currentCard.question}
              </p>

              {/* Answer (revealed) */}
              {revealed && (
                <div style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <p style={{
                    color: '#ffffffcc', fontSize: 13, lineHeight: 1.6,
                    margin: 0,
                  }}>
                    {currentCard.answer}
                  </p>
                </div>
              )}
            </div>

            {/* Reveal / Rate buttons */}
            {!revealed ? (
              <button
                onClick={() => setRevealed(true)}
                style={{
                  width: '100%',
                  padding: '12px 0',
                  background: 'linear-gradient(135deg, rgba(59,130,246,0.3), rgba(139,92,246,0.3))',
                  border: '1px solid rgba(59,130,246,0.3)',
                  borderRadius: 10,
                  color: '#93c5fd',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                Show Answer
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => handleRate(0)}
                  style={{
                    flex: 1, padding: '10px 0', fontSize: 12, fontWeight: 600,
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 8, color: '#fca5a5', cursor: 'pointer',
                  }}
                >
                  Again
                </button>
                <button
                  onClick={() => handleRate(2)}
                  style={{
                    flex: 1, padding: '10px 0', fontSize: 12, fontWeight: 600,
                    background: 'rgba(251, 191, 36, 0.15)',
                    border: '1px solid rgba(251, 191, 36, 0.3)',
                    borderRadius: 8, color: '#fde68a', cursor: 'pointer',
                  }}
                >
                  Hard
                </button>
                <button
                  onClick={() => handleRate(4)}
                  style={{
                    flex: 1, padding: '10px 0', fontSize: 12, fontWeight: 600,
                    background: 'rgba(34, 197, 94, 0.15)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    borderRadius: 8, color: '#86efac', cursor: 'pointer',
                  }}
                >
                  Good
                </button>
                <button
                  onClick={() => handleRate(5)}
                  style={{
                    flex: 1, padding: '10px 0', fontSize: 12, fontWeight: 600,
                    background: 'rgba(59, 130, 246, 0.15)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: 8, color: '#93c5fd', cursor: 'pointer',
                  }}
                >
                  Easy
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
