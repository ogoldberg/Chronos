/**
 * WebSocket server for CHRONOS real-time collaboration
 *
 * Room-based: users join a room (classroom ID or 'public').
 * Broadcasts cursor positions, annotations, navigation commands,
 * and event highlights to all room members except the sender.
 */

import type { Server as HTTPServer } from 'http';
import { WebSocketServer, type WebSocket } from 'ws';

// ── Message types ───────────────────────────────────────────────────

export type WSMessageType =
  | 'cursor'
  | 'annotation'
  | 'navigate'
  | 'highlight'
  | 'join'
  | 'leave';

export interface WSMessage {
  type: WSMessageType;
  roomId: string;
  userId: string;
  payload: Record<string, unknown>;
}

interface CursorPayload {
  year: number;
  x: number;
  y: number;
}

interface AnnotationPayload {
  eventId: string;
  text: string;
}

interface NavigatePayload {
  year: number;
  span: number;
}

interface HighlightPayload {
  eventId: string;
}

// Keep payload types exported for consumers
export type { CursorPayload, AnnotationPayload, NavigatePayload, HighlightPayload };

// ── Room tracking ───────────────────────────────────────────────────

interface RoomMember {
  ws: WebSocket;
  userId: string;
  userName: string;
}

const rooms = new Map<string, Map<string, RoomMember>>();

function getRoom(roomId: string): Map<string, RoomMember> {
  let room = rooms.get(roomId);
  if (!room) {
    room = new Map();
    rooms.set(roomId, room);
  }
  return room;
}

function broadcastToRoom(roomId: string, senderId: string, message: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const [uid, member] of room) {
    if (uid === senderId) continue;
    if (member.ws.readyState === 1 /* WebSocket.OPEN */) {
      member.ws.send(message);
    }
  }
}

function removeFromRoom(roomId: string, userId: string) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.delete(userId);

  // Broadcast leave to remaining members
  const leaveMsg: WSMessage = {
    type: 'leave',
    roomId,
    userId,
    payload: { members: getMemberList(roomId) },
  };
  broadcastToRoom(roomId, userId, JSON.stringify(leaveMsg));

  // Cleanup empty rooms
  if (room.size === 0) {
    rooms.delete(roomId);
  }
}

function getMemberList(roomId: string): Array<{ userId: string; userName: string }> {
  const room = rooms.get(roomId);
  if (!room) return [];
  return Array.from(room.values()).map(m => ({
    userId: m.userId,
    userName: m.userName,
  }));
}

// ── Server setup ────────────────────────────────────────────────────

export function attachWebSocketServer(httpServer: HTTPServer): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    let currentRoom: string | null = null;
    let currentUserId: string | null = null;

    ws.on('message', (raw: Buffer | string) => {
      let msg: WSMessage;
      try {
        msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
      } catch {
        return; // Ignore malformed messages
      }

      const { type, roomId, userId, payload } = msg;
      if (!type || !roomId || !userId) return;

      switch (type) {
        case 'join': {
          // Leave previous room if any
          if (currentRoom && currentUserId) {
            removeFromRoom(currentRoom, currentUserId);
          }

          currentRoom = roomId;
          currentUserId = userId;

          const room = getRoom(roomId);
          room.set(userId, {
            ws,
            userId,
            userName: (payload.userName as string) || userId,
          });

          // Broadcast join + member list to everyone in the room
          const joinMsg: WSMessage = {
            type: 'join',
            roomId,
            userId,
            payload: {
              userName: (payload.userName as string) || userId,
              members: getMemberList(roomId),
            },
          };
          broadcastToRoom(roomId, userId, JSON.stringify(joinMsg));

          // Send member list back to the joiner
          const ackMsg: WSMessage = {
            type: 'join',
            roomId,
            userId: 'server',
            payload: { members: getMemberList(roomId) },
          };
          ws.send(JSON.stringify(ackMsg));
          break;
        }

        case 'leave': {
          if (currentRoom && currentUserId) {
            removeFromRoom(currentRoom, currentUserId);
          }
          currentRoom = null;
          currentUserId = null;
          break;
        }

        case 'cursor': {
          const cp = payload as unknown as CursorPayload;
          if (cp.year == null || cp.x == null || cp.y == null) return;
          broadcastToRoom(roomId, userId, JSON.stringify(msg));
          break;
        }

        case 'annotation': {
          const ap = payload as unknown as AnnotationPayload;
          if (!ap.eventId || !ap.text) return;
          broadcastToRoom(roomId, userId, JSON.stringify(msg));
          break;
        }

        case 'navigate': {
          const np = payload as unknown as NavigatePayload;
          if (np.year == null || np.span == null) return;
          broadcastToRoom(roomId, userId, JSON.stringify(msg));
          break;
        }

        case 'highlight': {
          const hp = payload as unknown as HighlightPayload;
          if (!hp.eventId) return;
          broadcastToRoom(roomId, userId, JSON.stringify(msg));
          break;
        }
      }
    });

    ws.on('close', () => {
      if (currentRoom && currentUserId) {
        removeFromRoom(currentRoom, currentUserId);
      }
    });

    ws.on('error', () => {
      if (currentRoom && currentUserId) {
        removeFromRoom(currentRoom, currentUserId);
      }
    });
  });

  console.log('[CHRONOS] WebSocket server attached at /ws');
  return wss;
}
