import { useState, useEffect, useCallback } from 'react';
import type { Achievement } from '../services/gamification';
import { onAchievementUnlocked } from '../services/gamification';

interface ToastItem {
  id: string;
  achievement: Achievement;
  exiting: boolean;
}

const DISPLAY_MS = 4000;
const EXIT_MS = 400;

export default function AchievementToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_MS);
  }, []);

  useEffect(() => {
    const unsub = onAchievementUnlocked((achievement) => {
      const id = `${achievement.id}-${Date.now()}`;
      setToasts((prev) => [...prev, { id, achievement, exiting: false }]);

      setTimeout(() => dismiss(id), DISPLAY_MS);
    });
    return unsub;
  }, [dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      right: 24,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      pointerEvents: 'none',
    }}>
      <style>{`
        @keyframes achievementSlideIn {
          from { opacity: 0; transform: translateX(80px) scale(0.95); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes achievementSlideOut {
          from { opacity: 1; transform: translateX(0) scale(1); }
          to   { opacity: 0; transform: translateX(80px) scale(0.95); }
        }
      `}</style>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            background: 'rgba(10, 14, 22, 0.95)',
            border: '1px solid rgba(218, 165, 32, 0.4)',
            borderRadius: 14,
            padding: '14px 18px',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 20px rgba(218,165,32,0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            minWidth: 280,
            maxWidth: 360,
            pointerEvents: 'auto',
            animation: toast.exiting
              ? `achievementSlideOut ${EXIT_MS}ms ease-in forwards`
              : 'achievementSlideIn 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {/* Emoji */}
          <div style={{
            fontSize: 28,
            width: 44,
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(218, 165, 32, 0.1)',
            borderRadius: 10,
            flexShrink: 0,
          }}>
            {toast.achievement.emoji}
          </div>
          {/* Text */}
          <div style={{ flex: 1 }}>
            <div style={{
              color: '#daa520',
              fontSize: 9,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 2,
            }}>
              Achievement Unlocked
            </div>
            <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
              {toast.achievement.name}
            </div>
            <div style={{ color: '#ffffff80', fontSize: 11, lineHeight: 1.3 }}>
              {toast.achievement.description}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
