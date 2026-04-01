/**
 * Client-side WebSocket wrapper for CHRONOS real-time collaboration
 *
 * Auto-reconnects with exponential backoff, provides type-safe
 * callbacks, and exposes methods for sending cursor/annotation/
 * navigation/highlight messages.
 */

// ── Types ───────────────────────────────────────────────────────────

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

export interface CursorData {
  userId: string;
  year: number;
  x: number;
  y: number;
}

export interface AnnotationData {
  userId: string;
  eventId: string;
  text: string;
}

export interface NavigateData {
  userId: string;
  year: number;
  span: number;
}

export interface HighlightData {
  userId: string;
  eventId: string;
}

export interface PresenceData {
  type: 'join' | 'leave';
  userId: string;
  userName?: string;
  members: Array<{ userId: string; userName: string }>;
}

export interface RealtimeCallbacks {
  onCursorMove?: (data: CursorData) => void;
  onAnnotation?: (data: AnnotationData) => void;
  onNavigate?: (data: NavigateData) => void;
  onHighlight?: (data: HighlightData) => void;
  onPresence?: (data: PresenceData) => void;
  onConnectionChange?: (connected: boolean) => void;
}

export interface RealtimeConnection {
  sendCursor: (year: number, x: number, y: number) => void;
  sendAnnotation: (eventId: string, text: string) => void;
  sendNavigate: (year: number, span: number) => void;
  sendHighlight: (eventId: string) => void;
  disconnect: () => void;
  isConnected: () => boolean;
}

// ── Implementation ──────────────────────────────────────────────────

const BASE_DELAY = 500;
const MAX_DELAY = 30000;
const MAX_RETRIES = 20;

export function connectToRoom(
  roomId: string,
  userId: string,
  userName?: string,
  callbacks?: RealtimeCallbacks,
): RealtimeConnection {
  let ws: WebSocket | null = null;
  let connected = false;
  let intentionalClose = false;
  let retryCount = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function getWsUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }

  function send(msg: WSMessage) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function handleMessage(event: MessageEvent) {
    let msg: WSMessage;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'cursor': {
        const p = msg.payload as unknown as { year: number; x: number; y: number };
        callbacks?.onCursorMove?.({
          userId: msg.userId,
          year: p.year,
          x: p.x,
          y: p.y,
        });
        break;
      }
      case 'annotation': {
        const p = msg.payload as unknown as { eventId: string; text: string };
        callbacks?.onAnnotation?.({
          userId: msg.userId,
          eventId: p.eventId,
          text: p.text,
        });
        break;
      }
      case 'navigate': {
        const p = msg.payload as unknown as { year: number; span: number };
        callbacks?.onNavigate?.({
          userId: msg.userId,
          year: p.year,
          span: p.span,
        });
        break;
      }
      case 'highlight': {
        const p = msg.payload as unknown as { eventId: string };
        callbacks?.onHighlight?.({
          userId: msg.userId,
          eventId: p.eventId,
        });
        break;
      }
      case 'join':
      case 'leave': {
        const p = msg.payload as unknown as {
          userName?: string;
          members: Array<{ userId: string; userName: string }>;
        };
        callbacks?.onPresence?.({
          type: msg.type,
          userId: msg.userId,
          userName: p.userName,
          members: p.members ?? [],
        });
        break;
      }
    }
  }

  function connect() {
    if (intentionalClose) return;

    try {
      ws = new WebSocket(getWsUrl());
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      connected = true;
      retryCount = 0;
      callbacks?.onConnectionChange?.(true);

      // Join the room
      send({
        type: 'join',
        roomId,
        userId,
        payload: { userName: userName ?? userId },
      });
    };

    ws.onmessage = handleMessage;

    ws.onclose = () => {
      connected = false;
      callbacks?.onConnectionChange?.(false);
      if (!intentionalClose) {
        scheduleReconnect();
      }
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  function scheduleReconnect() {
    if (intentionalClose || retryCount >= MAX_RETRIES) return;
    const delay = Math.min(BASE_DELAY * Math.pow(2, retryCount), MAX_DELAY);
    retryCount++;
    retryTimer = setTimeout(connect, delay);
  }

  // Start connection
  connect();

  return {
    sendCursor(year: number, x: number, y: number) {
      send({
        type: 'cursor',
        roomId,
        userId,
        payload: { year, x, y },
      });
    },

    sendAnnotation(eventId: string, text: string) {
      send({
        type: 'annotation',
        roomId,
        userId,
        payload: { eventId, text },
      });
    },

    sendNavigate(year: number, span: number) {
      send({
        type: 'navigate',
        roomId,
        userId,
        payload: { year, span },
      });
    },

    sendHighlight(eventId: string) {
      send({
        type: 'highlight',
        roomId,
        userId,
        payload: { eventId },
      });
    },

    disconnect() {
      intentionalClose = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (ws) {
        send({ type: 'leave', roomId, userId, payload: {} });
        ws.close();
      }
      connected = false;
      callbacks?.onConnectionChange?.(false);
    },

    isConnected() {
      return connected;
    },
  };
}
