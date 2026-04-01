/**
 * CursorOverlay — renders other users' cursor positions on the timeline
 *
 * Shows colored dots with username labels that fade after 5 seconds
 * of inactivity. Positioned using yearToPixel from the viewport.
 */

import { useEffect, useState, useRef } from 'react';
import { useCollaborationStore } from '../../stores/collaborationStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { yearToPixel } from '../../canvas/viewport';

// ── Color for user (same as CollaborationPanel) ─────────────────────

const USER_COLORS = [
  '#4fc3f7', '#81c784', '#ffb74d', '#f06292',
  '#ba68c8', '#4dd0e1', '#aed581', '#ff8a65',
];

function colorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

// ── Types ───────────────────────────────────────────────────────────

interface CursorEntry {
  userId: string;
  year: number;
  x: number;
  y: number;
  lastSeen: number;
}

const FADE_TIMEOUT = 5000;

// ── Component ───────────────────────────────────────────────────────

export default function CursorOverlay() {
  const connected = useCollaborationStore(s => s.connected);
  const showCursors = useCollaborationStore(s => s.showCursors);
  const cursors = useCollaborationStore(s => s.cursors);
  const viewport = useTimelineStore(s => s.viewport);
  const [, forceUpdate] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Periodically force re-render to update fade effect
  useEffect(() => {
    if (connected && showCursors) {
      timerRef.current = setInterval(() => forceUpdate(n => n + 1), 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [connected, showCursors]);

  if (!connected || !showCursors) return null;

  const now = Date.now();
  const width = window.innerWidth;
  const entries: CursorEntry[] = [];

  for (const [userId, cursor] of cursors) {
    entries.push({
      userId,
      year: cursor.year,
      x: cursor.x,
      y: cursor.y,
      lastSeen: cursor.lastSeen,
    });
  }

  // Filter out cursors older than 2x the fade timeout
  const activeCursors = entries.filter(c => now - c.lastSeen < FADE_TIMEOUT * 2);

  if (activeCursors.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: 50,
    }}>
      {activeCursors.map(cursor => {
        const age = now - cursor.lastSeen;
        const opacity = age > FADE_TIMEOUT ? Math.max(0, 1 - (age - FADE_TIMEOUT) / FADE_TIMEOUT) : 1;
        const px = yearToPixel(cursor.year, viewport, width);
        const color = colorForUser(cursor.userId);

        return (
          <div
            key={cursor.userId}
            style={{
              position: 'absolute',
              left: px,
              top: cursor.y,
              transform: 'translate(-50%, -50%)',
              opacity,
              transition: 'left 0.3s ease, top 0.3s ease, opacity 0.5s ease',
            }}
          >
            {/* Cursor dot */}
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: color, border: '2px solid rgba(0,0,0,0.4)',
              boxShadow: `0 0 6px ${color}60`,
            }} />
            {/* Username label */}
            <div style={{
              position: 'absolute', top: 14, left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.7)', color, fontSize: 9,
              fontWeight: 600, padding: '1px 5px', borderRadius: 4,
              whiteSpace: 'nowrap',
            }}>
              {cursor.userId.slice(0, 10)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
