/**
 * Zustand store for real-time collaboration state
 */

import { create } from 'zustand';
import type { RealtimeConnection } from '../services/realtimeClient';

interface CursorInfo {
  year: number;
  x: number;
  y: number;
  lastSeen: number;
}

interface CollaborationState {
  roomId: string | null;
  setRoomId: (id: string | null) => void;

  connected: boolean;
  setConnected: (c: boolean) => void;

  members: Array<{ userId: string; userName: string }>;
  setMembers: (m: Array<{ userId: string; userName: string }>) => void;

  connection: RealtimeConnection | null;
  setConnection: (c: RealtimeConnection | null) => void;

  showCursors: boolean;
  toggleCursors: () => void;

  isTeacher: boolean;
  setIsTeacher: (t: boolean) => void;

  cursors: Map<string, CursorInfo>;
  updateCursor: (userId: string, data: { year: number; x: number; y: number }) => void;
}

export const useCollaborationStore = create<CollaborationState>((set) => ({
  roomId: null,
  setRoomId: (id) => set({ roomId: id }),

  connected: false,
  setConnected: (c) => set({ connected: c }),

  members: [],
  setMembers: (m) => set({ members: m }),

  connection: null,
  setConnection: (c) => set({ connection: c }),

  showCursors: true,
  toggleCursors: () => set(s => ({ showCursors: !s.showCursors })),

  isTeacher: false,
  setIsTeacher: (t) => set({ isTeacher: t }),

  cursors: new Map(),
  updateCursor: (userId, data) => set(s => {
    const next = new Map(s.cursors);
    next.set(userId, { year: data.year, x: data.x, y: data.y, lastSeen: Date.now() });
    return { cursors: next };
  }),
}));
