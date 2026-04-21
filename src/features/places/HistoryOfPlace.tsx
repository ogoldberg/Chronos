/**
 * "History of This Place" — geolocation-aware history
 *
 * Uses the browser's Geolocation API to find the user's position,
 * then shows historical events near that location.
 */

import { useState } from 'react';
import { formatYear } from '../../utils/format';

interface NearbyEvent {
  title: string;
  year: number;
  emoji: string;
  description: string;
  distance: number; // km
  wiki?: string;
}

interface Props {
  onNavigate: (year: number, span: number) => void;
  onClose: () => void;
}

export default function HistoryOfPlace({ onNavigate, onClose }: Props) {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [events, setEvents] = useState<NearbyEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [manualInput, setManualInput] = useState('');

  const fetchNearby = async (lat: number, lng: number) => {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch('/api/nearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, radius: 50 }),
      });
      const data = await resp.json();
      setEvents(data.events || []);
    } catch {
      setError('Failed to load nearby events');
    } finally {
      setLoading(false);
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported in this browser');
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocation(loc);
        fetchNearby(loc.lat, loc.lng);
      },
      () => setError('Location access denied. Try entering a place name instead.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const searchPlace = async () => {
    if (!manualInput.trim()) return;
    setLoading(true);
    try {
      // Use Nominatim for geocoding
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(manualInput)}&format=json&limit=1`
      );
      const data = await resp.json();
      if (data[0]) {
        const loc = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        setLocation(loc);
        fetchNearby(loc.lat, loc.lng);
      } else {
        setError('Place not found');
        setLoading(false);
      }
    } catch {
      setError('Search failed');
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'absolute', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 450, maxWidth: 'calc(100vw - 40px)', maxHeight: '80vh',
      background: 'rgba(10, 14, 22, 0.96)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 18, backdropFilter: 'blur(24px)',
      boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      zIndex: 200, overflow: 'hidden',
      animation: 'modalSlideIn 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    }}>
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: 0 }}>
            📍 History of This Place
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#ffffff60', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        {!location && (
          <>
            <button
              onClick={useMyLocation}
              disabled={loading}
              style={{
                width: '100%', padding: '12px 16px',
                background: 'rgba(59, 130, 246, 0.2)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: 10, color: '#fff', fontSize: 14,
                fontWeight: 600, cursor: 'pointer', marginBottom: 12,
              }}
            >
              {loading ? 'Finding you...' : '📍 Use My Location'}
            </button>

            <div style={{ textAlign: 'center', color: '#ffffff30', fontSize: 11, margin: '8px 0' }}>or</div>

            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="Enter a place name..."
                value={manualInput}
                onChange={e => setManualInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchPlace()}
                style={{
                  flex: 1, padding: '10px 14px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10, color: '#fff', fontSize: 13, outline: 'none',
                }}
              />
              <button
                onClick={searchPlace}
                style={{
                  padding: '10px 16px',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10, color: '#fff', cursor: 'pointer',
                }}
              >
                →
              </button>
            </div>
          </>
        )}

        {error && (
          <div style={{ color: '#ef4444', fontSize: 12, marginTop: 8 }}>{error}</div>
        )}

        {location && (
          <div style={{ marginTop: 12 }}>
            <div style={{ color: '#ffffff40', fontSize: 11, fontFamily: 'monospace', marginBottom: 12 }}>
              📍 {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
              <button
                onClick={() => { setLocation(null); setEvents([]); }}
                style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', marginLeft: 8, fontSize: 11 }}
              >
                Change
              </button>
            </div>

            {loading && <div style={{ color: '#ffffff50', fontSize: 13 }}>Discovering nearby history...</div>}

            <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
              {events.map((event, i) => (
                <div key={i} style={{
                  padding: '12px 0',
                  borderBottom: i < events.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div>
                      <span style={{ fontSize: 16, marginRight: 6 }}>{event.emoji}</span>
                      <span style={{ color: '#fff', fontWeight: 500, fontSize: 14 }}>{event.title}</span>
                    </div>
                    <span style={{ color: '#ffffff40', fontSize: 10, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      {event.distance < 1 ? '<1km' : `${Math.round(event.distance)}km`}
                    </span>
                  </div>
                  <div style={{ color: '#ffffff60', fontSize: 12, margin: '4px 0' }}>{formatYear(event.year)}</div>
                  <div style={{ color: '#ffffffaa', fontSize: 12, lineHeight: 1.5 }}>{event.description}</div>
                  <button
                    onClick={() => onNavigate(event.year, Math.max(50, Math.abs(event.year) * 0.1))}
                    style={{
                      marginTop: 6, background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 6, padding: '3px 8px',
                      color: '#ffffff80', fontSize: 10, cursor: 'pointer',
                    }}
                  >
                    View on Timeline →
                  </button>
                </div>
              ))}
              {events.length === 0 && !loading && location && (
                <div style={{ color: '#ffffff40', fontSize: 13, textAlign: 'center', padding: 20 }}>
                  No historical events found nearby. Try a different location.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
