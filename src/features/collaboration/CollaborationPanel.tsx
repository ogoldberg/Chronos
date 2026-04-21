/**
 * CollaborationPanel — real-time collaboration UI
 *
 * Allows users to create/join rooms, see connected users,
 * view live annotations, and (for teachers) navigate all
 * students or highlight events.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  connectToRoom,
  type RealtimeConnection,
  type AnnotationData,
  type PresenceData,
} from '../../services/realtimeClient';
import { useCollaborationStore } from '../../stores/collaborationStore';
import { useUIStore } from '../../stores/uiStore';
import { useTimelineStore, getAllEvents } from '../../stores/timelineStore';

// ── Color assignment for users ──────────────────────────────────────

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

// ── Component ───────────────────────────────────────────────────────

export default function CollaborationPanel() {
  const closePanel = useUIStore(s => s.closePanel);
  const viewport = useTimelineStore(s => s.viewport);
  const selectedEvent = useTimelineStore(s => s.selectedEvent);

  const {
    roomId, setRoomId, connected, setConnected,
    members, setMembers, connection, setConnection,
    showCursors, toggleCursors, isTeacher, setIsTeacher,
  } = useCollaborationStore();

  const [joinInput, setJoinInput] = useState('');
  const [annotations, setAnnotations] = useState<AnnotationData[]>([]);
  const [annotationInput, setAnnotationInput] = useState('');
  const connectionRef = useRef<RealtimeConnection | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Don't disconnect when panel closes — connection persists
    };
  }, []);

  const handleConnect = useCallback((targetRoomId: string) => {
    // Disconnect existing
    if (connectionRef.current) {
      connectionRef.current.disconnect();
    }

    const userId = `user_${Math.random().toString(36).slice(2, 8)}`;
    const userName = `User ${userId.slice(5)}`;

    const conn = connectToRoom(targetRoomId, userId, userName, {
      onAnnotation(data: AnnotationData) {
        setAnnotations(prev => [...prev.slice(-49), data]);
      },
      onPresence(data: PresenceData) {
        setMembers(data.members);
      },
      onNavigate(data) {
        // If we're a student, follow the teacher's navigation
        if (!useCollaborationStore.getState().isTeacher) {
          useTimelineStore.getState().setViewport({
            centerYear: data.year,
            span: data.span,
          });
        }
      },
      onHighlight(data) {
        // Highlight event in the timeline. Anchor events live as a module
        // constant (not a store field), so pull them in directly.
        const events = getAllEvents(useTimelineStore.getState());
        const ev = events.find(e => e.id === data.eventId);
        if (ev) {
          useTimelineStore.getState().setSelectedEvent(ev);
        }
      },
      onConnectionChange(isConnected: boolean) {
        setConnected(isConnected);
      },
      onCursorMove(data) {
        useCollaborationStore.getState().updateCursor(data.userId, data);
      },
    });

    connectionRef.current = conn;
    setConnection(conn);
    setRoomId(targetRoomId);
  }, [setConnection, setRoomId, setConnected, setMembers]);

  const handleCreateRoom = () => {
    const newRoomId = `room_${Math.random().toString(36).slice(2, 8)}`;
    setIsTeacher(true);
    handleConnect(newRoomId);
  };

  const handleJoinRoom = () => {
    if (!joinInput.trim()) return;
    setIsTeacher(false);
    handleConnect(joinInput.trim());
  };

  const handleDisconnect = () => {
    if (connectionRef.current) {
      connectionRef.current.disconnect();
      connectionRef.current = null;
    }
    setConnection(null);
    setRoomId(null);
    setConnected(false);
    setMembers([]);
    setAnnotations([]);
  };

  const handleNavigateAll = () => {
    if (connection && isTeacher) {
      connection.sendNavigate(viewport.centerYear, viewport.span);
    }
  };

  const handleHighlightEvent = () => {
    if (connection && isTeacher && selectedEvent) {
      connection.sendHighlight(selectedEvent.id);
    }
  };

  const handleSendAnnotation = () => {
    if (!connection || !annotationInput.trim() || !selectedEvent) return;
    connection.sendAnnotation(selectedEvent.id, annotationInput.trim());
    setAnnotations(prev => [
      ...prev.slice(-49),
      { userId: 'me', eventId: selectedEvent.id, text: annotationInput.trim() },
    ]);
    setAnnotationInput('');
  };

  return (
    <>
      <div className="overlay-backdrop" onClick={closePanel} />
      <div style={{
        position: 'fixed', top: 60, right: 20, width: 360,
        maxHeight: 'calc(100vh - 100px)',
        background: 'rgba(13, 17, 23, 0.95)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16, padding: 20, zIndex: 1000,
        overflowY: 'auto', color: '#e6edf3',
        backdropFilter: 'blur(20px)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Collaboration</h3>
          <button onClick={closePanel} style={{
            background: 'none', border: 'none', color: '#ffffff60',
            fontSize: 18, cursor: 'pointer',
          }}>x</button>
        </div>

        {/* Connection status */}
        {connected && roomId ? (
          <div>
            {/* Room info */}
            <div style={{
              background: 'rgba(76, 175, 80, 0.1)', border: '1px solid rgba(76, 175, 80, 0.3)',
              borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Room: <strong>{roomId}</strong></span>
                <span style={{ color: '#4caf50' }}>Connected</span>
              </div>
              {isTeacher && (
                <div style={{ color: '#ffb74d', fontSize: 11, marginTop: 4 }}>
                  Teacher mode
                </div>
              )}
            </div>

            {/* Members */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#ffffff60', marginBottom: 6 }}>
                Connected users ({members.length})
              </div>
              {members.map(m => (
                <div key={m.userId} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '4px 0', fontSize: 12,
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: colorForUser(m.userId), display: 'inline-block',
                  }} />
                  <span>{m.userName}</span>
                </div>
              ))}
            </div>

            {/* Cursor toggle */}
            <label style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 12, marginBottom: 12, cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={showCursors}
                onChange={toggleCursors}
              />
              Show other users' cursors
            </label>

            {/* Teacher controls */}
            {isTeacher && (
              <div style={{
                background: 'rgba(255, 183, 77, 0.08)',
                border: '1px solid rgba(255, 183, 77, 0.2)',
                borderRadius: 8, padding: 10, marginBottom: 12,
              }}>
                <div style={{ fontSize: 11, color: '#ffb74d', marginBottom: 8 }}>Teacher Controls</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={handleNavigateAll} style={teacherBtnStyle}>
                    Navigate all to here
                  </button>
                  <button
                    onClick={handleHighlightEvent}
                    disabled={!selectedEvent}
                    style={{
                      ...teacherBtnStyle,
                      opacity: selectedEvent ? 1 : 0.4,
                    }}
                  >
                    Highlight this event
                  </button>
                </div>
              </div>
            )}

            {/* Annotation input */}
            {selectedEvent && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#ffffff60', marginBottom: 4 }}>
                  Annotate: {selectedEvent.title}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={annotationInput}
                    onChange={e => setAnnotationInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSendAnnotation()}
                    placeholder="Add a shared annotation..."
                    style={inputStyle}
                  />
                  <button onClick={handleSendAnnotation} style={sendBtnStyle}>Send</button>
                </div>
              </div>
            )}

            {/* Annotations feed */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#ffffff60', marginBottom: 6 }}>
                Live annotations
              </div>
              <div style={{
                maxHeight: 160, overflowY: 'auto',
                background: 'rgba(0,0,0,0.2)', borderRadius: 6, padding: 6,
              }}>
                {annotations.length === 0 ? (
                  <div style={{ fontSize: 11, color: '#ffffff30', padding: 8, textAlign: 'center' }}>
                    No annotations yet
                  </div>
                ) : (
                  annotations.map((a, i) => (
                    <div key={i} style={{ fontSize: 11, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ color: colorForUser(a.userId), fontWeight: 600 }}>
                        {a.userId === 'me' ? 'You' : a.userId}
                      </span>
                      {': '}{a.text}
                    </div>
                  ))
                )}
              </div>
            </div>

            <button onClick={handleDisconnect} style={{
              ...sendBtnStyle, background: 'rgba(244,67,54,0.15)',
              border: '1px solid rgba(244,67,54,0.3)', color: '#f44336', width: '100%',
            }}>
              Disconnect
            </button>
          </div>
        ) : (
          <div>
            {/* Create room */}
            <button onClick={handleCreateRoom} style={{
              ...sendBtnStyle, width: '100%', marginBottom: 16, padding: '10px 16px',
            }}>
              Start sharing (create room)
            </button>

            {/* Join room */}
            <div style={{ fontSize: 11, color: '#ffffff60', marginBottom: 6 }}>
              Or join an existing room:
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={joinInput}
                onChange={e => setJoinInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleJoinRoom()}
                placeholder="Enter room code..."
                style={inputStyle}
              />
              <button onClick={handleJoinRoom} style={sendBtnStyle}>Join</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  flex: 1, background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
  padding: '6px 10px', color: '#e6edf3', fontSize: 12,
  outline: 'none',
};

const sendBtnStyle: React.CSSProperties = {
  background: 'rgba(79, 195, 247, 0.15)',
  border: '1px solid rgba(79, 195, 247, 0.3)',
  borderRadius: 6, padding: '6px 12px',
  color: '#4fc3f7', fontSize: 12, fontWeight: 600,
  cursor: 'pointer', whiteSpace: 'nowrap',
};

const teacherBtnStyle: React.CSSProperties = {
  background: 'rgba(255, 183, 77, 0.15)',
  border: '1px solid rgba(255, 183, 77, 0.3)',
  borderRadius: 6, padding: '5px 10px',
  color: '#ffb74d', fontSize: 11, fontWeight: 600,
  cursor: 'pointer',
};
