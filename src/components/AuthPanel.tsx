import { useState } from 'react';
import { signIn, signUp, signOut, useSession } from '../services/authClient';

interface Props {
  onClose: () => void;
}

export default function AuthPanel({ onClose }: Props) {
  const { data: session, isPending } = useSession();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'signup') {
        const result = await signUp.email({ email, password, name });
        if (result.error) setError(result.error.message || 'Sign up failed');
      } else {
        const result = await signIn.email({ email, password });
        if (result.error) setError(result.error.message || 'Sign in failed');
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (isPending) {
    return (
      <div style={panelStyle}>
        <div style={{ color: '#ffffff60', textAlign: 'center', padding: 40 }}>Loading...</div>
      </div>
    );
  }

  // Logged in — show profile
  if (session?.user) {
    return (
      <div style={panelStyle}>
        <div style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              fontWeight: 600,
              color: '#fff',
            }}>
              {(session.user.name || session.user.email)?.[0]?.toUpperCase() || '?'}
            </div>
            <div>
              <div style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>
                {session.user.name || 'Explorer'}
              </div>
              <div style={{ color: '#ffffff50', fontSize: 12 }}>
                {session.user.email}
              </div>
            </div>
            <button onClick={onClose} style={closeStyle}>✕</button>
          </div>

          <div style={{
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            fontSize: 13,
            color: '#ffffffcc',
            lineHeight: 1.6,
          }}>
            Your progress, achievements, and annotations are saved to your account and sync across devices.
          </div>

          <button
            onClick={() => signOut()}
            style={{
              width: '100%',
              padding: '10px 16px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: 10,
              color: '#ef4444',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // Auth form
  return (
    <div style={panelStyle}>
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: 0 }}>
            {mode === 'login' ? 'Welcome Back' : 'Join CHRONOS'}
          </h2>
          <button onClick={onClose} style={closeStyle}>✕</button>
        </div>

        <p style={{ color: '#ffffff60', fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>
          {mode === 'login'
            ? 'Sign in to sync your progress, achievements, and annotations.'
            : 'Create an account to save your journey through history.'}
        </p>

        {/* Social login buttons */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            onClick={() => signIn.social({ provider: 'google' })}
            style={socialBtnStyle}
          >
            Google
          </button>
          <button
            onClick={() => signIn.social({ provider: 'github' })}
            style={socialBtnStyle}
          >
            GitHub
          </button>
        </div>

        <div style={{
          textAlign: 'center',
          color: '#ffffff30',
          fontSize: 11,
          margin: '12px 0',
          position: 'relative',
        }}>
          <span style={{ background: 'rgba(10,14,22,0.94)', padding: '0 10px', position: 'relative', zIndex: 1 }}>or</span>
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, borderTop: '1px solid rgba(255,255,255,0.06)' }} />
        </div>

        {/* Email form */}
        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <input
              type="text"
              placeholder="Display name"
              value={name}
              onChange={e => setName(e.target.value)}
              style={inputStyle}
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
            style={inputStyle}
          />

          {error && (
            <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 12 }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '11px 16px',
              background: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: 10,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              marginBottom: 12,
            }}
          >
            {loading ? '...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}
            style={{
              background: 'none',
              border: 'none',
              color: '#3b82f6',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 380,
  maxWidth: 'calc(100vw - 40px)',
  background: 'rgba(10, 14, 22, 0.96)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 18,
  backdropFilter: 'blur(24px)',
  boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
  zIndex: 200,
  animation: 'modalSlideIn 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
};

const closeStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#ffffff60',
  fontSize: 18,
  cursor: 'pointer',
  marginLeft: 'auto',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  color: '#fff',
  fontSize: 13,
  outline: 'none',
  marginBottom: 10,
  boxSizing: 'border-box',
};

const socialBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px 16px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  color: '#ffffffcc',
  fontSize: 13,
  cursor: 'pointer',
  fontWeight: 500,
};
