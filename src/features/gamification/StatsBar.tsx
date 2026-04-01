import { useState, useEffect } from 'react';
import {
  getStats,
  getXPForNextLevel,
  getXPForCurrentLevel,
  subscribe,
  ACHIEVEMENTS,
  LEVEL_THRESHOLDS,
} from './gamification';
import type { PlayerStats } from './gamification';

export default function StatsBar() {
  const [stats, setStats] = useState<PlayerStats>(getStats);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    return subscribe(setStats);
  }, []);

  const currentLevelXP = getXPForCurrentLevel(stats.level);
  const nextLevelXP = getXPForNextLevel(stats.level);
  const progressXP = stats.xp - currentLevelXP;
  const neededXP = nextLevelXP - currentLevelXP;
  const progressPct = neededXP > 0 ? Math.min((progressXP / neededXP) * 100, 100) : 100;
  const maxLevel = stats.level >= LEVEL_THRESHOLDS.length;

  return (
    <>
      {/* Compact bar */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          position: 'absolute',
          top: 18,
          left: 20,
          zIndex: 25,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'rgba(10, 14, 22, 0.9)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12,
          padding: '6px 14px',
          backdropFilter: 'blur(16px)',
          cursor: 'pointer',
          transition: 'all 0.2s',
          userSelect: 'none',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
        }}
      >
        {/* Level badge */}
        <div style={{
          background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
          borderRadius: 8,
          width: 28,
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 700,
          color: '#fff',
          flexShrink: 0,
        }}>
          {stats.level}
        </div>

        {/* XP bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 80 }}>
          <div style={{
            fontSize: 10, color: '#ffffff60', fontFamily: 'monospace',
          }}>
            {stats.xp} XP {maxLevel ? '(MAX)' : ''}
          </div>
          <div style={{
            height: 3, borderRadius: 2,
            background: 'rgba(255,255,255,0.06)',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${progressPct}%`,
              borderRadius: 2,
              background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
              transition: 'width 0.5s ease',
            }} />
          </div>
        </div>

        {/* Streak */}
        {stats.quizStreak > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 3,
            color: '#f59e0b', fontSize: 12, fontWeight: 600,
          }}>
            {'\ud83d\udd25'}{stats.quizStreak}
          </div>
        )}
      </div>

      {/* Expanded panel */}
      {expanded && (
        <>
          <div
            onClick={() => setExpanded(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 89, background: 'rgba(0,0,0,0.4)',
            }}
          />
          <div style={{
            position: 'absolute',
            top: 60,
            left: 20,
            zIndex: 90,
            width: 340,
            maxWidth: 'calc(100vw - 40px)',
            maxHeight: 'calc(100vh - 100px)',
            background: 'rgba(10, 14, 22, 0.96)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16,
            backdropFilter: 'blur(20px)',
            boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
            overflowY: 'auto',
            animation: 'panelSlideUp 0.2s ease-out',
          }}>
            {/* Header */}
            <div style={{
              padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{
                fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4,
              }}>
                Player Stats
              </div>
              <div style={{
                fontSize: 11, color: '#ffffff50',
              }}>
                Level {stats.level} {'\u2022'} {stats.xp} XP Total
              </div>
            </div>

            {/* Stats grid */}
            <div style={{
              padding: '14px 18px',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              {[
                { label: 'Events Viewed', value: stats.eventsViewed },
                { label: 'Eras Explored', value: stats.erasExplored.size },
                { label: 'Quiz Correct', value: `${stats.totalQuizCorrect}/${stats.totalQuizAttempted}` },
                { label: 'Best Streak', value: stats.bestStreak },
                { label: 'Myths Busted', value: stats.mythsRevealed },
                { label: 'Continents', value: stats.continentsVisited.size },
              ].map((item) => (
                <div key={item.label} style={{
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 8, padding: '8px 10px',
                }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>
                    {item.value}
                  </div>
                  <div style={{ fontSize: 10, color: '#ffffff50', marginTop: 2 }}>
                    {item.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Achievements */}
            <div style={{ padding: '14px 18px' }}>
              <div style={{
                fontSize: 11, fontWeight: 600, color: '#ffffff50',
                textTransform: 'uppercase', letterSpacing: 0.8,
                marginBottom: 10,
              }}>
                Achievements ({stats.achievements.length}/{ACHIEVEMENTS.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ACHIEVEMENTS.map((ach) => {
                  const unlocked = stats.achievements.includes(ach.id);
                  return (
                    <div key={ach.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 8,
                      background: unlocked ? 'rgba(218,165,32,0.06)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${unlocked ? 'rgba(218,165,32,0.15)' : 'rgba(255,255,255,0.03)'}`,
                      opacity: unlocked ? 1 : 0.45,
                    }}>
                      <span style={{ fontSize: 18, filter: unlocked ? 'none' : 'grayscale(1)' }}>
                        {ach.emoji}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: unlocked ? '#fff' : '#ffffff80' }}>
                          {ach.name}
                        </div>
                        <div style={{ fontSize: 10, color: '#ffffff50', marginTop: 1 }}>
                          {ach.description}
                        </div>
                      </div>
                      {unlocked && (
                        <span style={{ color: '#daa520', fontSize: 14 }}>{'\u2713'}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
