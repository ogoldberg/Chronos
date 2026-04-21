/**
 * AI Settings — where the user enters their own API key for AI features.
 *
 * Opens via the command palette ("AI settings...") or automatically
 * when a gated AI action fires AI_KEY_NEEDED_EVENT. We keep this tight
 * and focused: pick provider, pick model, paste key, optional base URL,
 * save. No account, no cloud sync, no hidden state.
 */

import { useEffect, useState } from 'react';
import {
  useAIConfigStore,
  type AIProviderId,
  type ProviderOption,
} from '../../stores/aiConfigStore';

interface Props {
  onClose: () => void;
  /** Optional note from the gentle-gate overlay explaining why the user
   *  was bounced here (e.g. "Click Ask the Guide needs a key"). */
  reason?: string;
}

export default function AISettings({ onClose, reason }: Props) {
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);

  const provider = useAIConfigStore((s) => s.provider);
  const model = useAIConfigStore((s) => s.model);
  const apiKey = useAIConfigStore((s) => s.apiKey);
  const baseUrl = useAIConfigStore((s) => s.baseUrl);
  const setProvider = useAIConfigStore((s) => s.setProvider);
  const setModel = useAIConfigStore((s) => s.setModel);
  const setApiKey = useAIConfigStore((s) => s.setApiKey);
  const setBaseUrl = useAIConfigStore((s) => s.setBaseUrl);
  const clear = useAIConfigStore((s) => s.clear);

  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'testing' }
    | { kind: 'ok'; message: string }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((data: { providers?: ProviderOption[] }) => {
        setProviders(data.providers ?? []);
      })
      .catch(() => setProviders([]))
      .finally(() => setLoadingProviders(false));
  }, []);

  const current = providers.find((p) => p.id === provider);

  const handleProviderChange = (id: AIProviderId) => {
    const option = providers.find((p) => p.id === id);
    setProvider(id, option?.defaultModel ?? model);
    setTestStatus({ kind: 'idle' });
  };

  const testConnection = async () => {
    if (provider !== 'ollama' && !apiKey) {
      setTestStatus({ kind: 'error', message: 'Enter a key first.' });
      return;
    }
    setTestStatus({ kind: 'testing' });
    try {
      // Go straight to the provider — same path the app itself uses. This
      // is an honest end-to-end test; nothing in between can help or hurt.
      const { callAI } = await import('../../ai/callAI');
      await callAI('You are a test.', [{ role: 'user', content: 'Say "ok".' }], { maxTokens: 10 });
      setTestStatus({ kind: 'ok', message: 'Connected successfully.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error.';
      setTestStatus({ kind: 'error', message: msg });
    }
  };

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div>
            <div style={titleStyle}>AI Settings</div>
            <div style={subtitleStyle}>
              Bring your own API key — your key and every AI request go
              straight to the provider. Chronos never sees them.
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close">
            ×
          </button>
        </div>

        {reason && (
          <div style={reasonBannerStyle}>
            <span style={{ fontWeight: 600, marginRight: 6 }}>Why you're here:</span>
            {reason}
          </div>
        )}

        {/* Privacy reassurance — the key never leaves the browser.
            Every AI call is a direct HTTPS request from this tab to the
            provider's API. Our server is never in the path for AI
            traffic. This is zero-trust by design, not by promise. */}
        <div style={privacyBannerStyle}>
          <div style={{ fontWeight: 600, marginBottom: 4, color: '#a7f3d0' }}>
            🔒 Your key never leaves this browser
          </div>
          <div style={{ color: 'rgba(255,255,255,0.7)' }}>
            AI requests go directly from this browser tab to your chosen
            provider over HTTPS. Chronos has no API endpoint that receives
            your key or your messages — the network traffic skips our
            server entirely. You can verify this in your browser's devtools
            Network tab (look for api.anthropic.com, api.openai.com, or
            generativelanguage.googleapis.com — not our domain).
          </div>
          <div style={{ marginTop: 6, color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>
            Your key lives in this browser's localStorage only. Clear it
            any time with "Clear key" below; it also goes away when you
            clear site data.
          </div>
        </div>

        <div style={sectionStyle}>
          <label style={labelStyle}>Provider</label>
          {loadingProviders ? (
            <div style={mutedStyle}>Loading providers…</div>
          ) : (
            <div style={providerGridStyle}>
              {providers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleProviderChange(p.id)}
                  style={{
                    ...providerCardStyle,
                    borderColor:
                      provider === p.id
                        ? 'rgba(246,183,60,0.55)'
                        : 'rgba(255,255,255,0.08)',
                    background:
                      provider === p.id
                        ? 'rgba(246,183,60,0.08)'
                        : 'rgba(255,255,255,0.02)',
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#f5f1e8' }}>{p.label}</div>
                  <div style={{ ...mutedStyle, marginTop: 4, fontSize: 11 }}>
                    {p.description}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={sectionStyle}>
          <label style={labelStyle} htmlFor="ai-model">
            Model
          </label>
          <input
            id="ai-model"
            list="ai-model-options"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={current?.defaultModel}
            style={inputStyle}
          />
          {current && (
            <datalist id="ai-model-options">
              {current.suggestedModels.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          )}
          {current && (
            <div style={{ ...mutedStyle, marginTop: 6 }}>
              Any valid model ID works — the dropdown is just suggestions.
            </div>
          )}
        </div>

        {current?.localOnly ? (
          <div style={sectionStyle}>
            <label style={labelStyle} htmlFor="ai-base-url">
              Base URL
            </label>
            <input
              id="ai-base-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:11434"
              style={inputStyle}
            />
            <div style={{ ...mutedStyle, marginTop: 6 }}>
              Ollama runs locally — no API key needed. Leave blank to use the default.
            </div>
          </div>
        ) : (
          <>
            <div style={sectionStyle}>
              <label style={labelStyle} htmlFor="ai-key">
                API Key
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  id="ai-key"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    provider === 'anthropic'
                      ? 'sk-ant-…'
                      : provider === 'openai'
                      ? 'sk-…'
                      : provider === 'google'
                      ? 'AIza…'
                      : 'Paste your key'
                  }
                  style={{ ...inputStyle, paddingRight: 64 }}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  style={eyeBtnStyle}
                >
                  {showKey ? 'hide' : 'show'}
                </button>
              </div>
              {current?.keyPage && (
                <div style={{ ...mutedStyle, marginTop: 6 }}>
                  Don't have one?{' '}
                  <a
                    href={current.keyPage}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={linkStyle}
                  >
                    Get a key from {current.label} ↗
                  </a>
                </div>
              )}
            </div>

            <div style={sectionStyle}>
              <label style={labelStyle} htmlFor="ai-base-url">
                Base URL (optional)
              </label>
              <input
                id="ai-base-url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="Leave blank unless using a proxy"
                style={inputStyle}
              />
            </div>
          </>
        )}

        <div style={actionRowStyle}>
          <button
            onClick={testConnection}
            disabled={testStatus.kind === 'testing'}
            style={secondaryBtnStyle}
          >
            {testStatus.kind === 'testing' ? 'Testing…' : 'Test connection'}
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={clear} style={dangerBtnStyle}>
            Clear key
          </button>
          <button onClick={onClose} style={primaryBtnStyle}>
            Done
          </button>
        </div>

        {testStatus.kind === 'ok' && (
          <div style={{ ...testStatusStyle, color: '#4ade80' }}>
            ✓ {testStatus.message}
          </div>
        )}
        {testStatus.kind === 'error' && (
          <div style={{ ...testStatusStyle, color: '#f87171' }}>
            ✗ {testStatus.message}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.75)',
  backdropFilter: 'blur(4px)',
  zIndex: 2000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
};

const panelStyle: React.CSSProperties = {
  background: 'rgba(13,17,23,0.98)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 14,
  padding: 24,
  maxWidth: 520,
  width: '100%',
  maxHeight: '90vh',
  overflowY: 'auto',
  fontFamily: 'var(--font-ui, -apple-system, sans-serif)',
  color: '#f5f1e8',
  boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  marginBottom: 16,
};

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display, Fraunces, Georgia, serif)',
  fontSize: 22,
  fontWeight: 600,
  color: '#ffcc70',
};

const subtitleStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.55)',
  fontSize: 12,
  marginTop: 4,
};

const closeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.12)',
  color: 'rgba(255,255,255,0.6)',
  borderRadius: 8,
  width: 30,
  height: 30,
  fontSize: 18,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const sectionStyle: React.CSSProperties = { marginBottom: 16 };

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.8,
  color: 'rgba(255,255,255,0.55)',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  color: '#f5f1e8',
  fontSize: 13,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  boxSizing: 'border-box',
};

const eyeBtnStyle: React.CSSProperties = {
  position: 'absolute',
  right: 8,
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'transparent',
  border: 'none',
  color: 'rgba(255,255,255,0.5)',
  fontSize: 11,
  cursor: 'pointer',
  padding: '4px 6px',
  fontFamily: 'inherit',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const providerGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: 8,
};

const providerCardStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.02)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  color: '#f5f1e8',
};

const mutedStyle: React.CSSProperties = {
  color: 'rgba(255,255,255,0.5)',
  fontSize: 12,
};

const linkStyle: React.CSSProperties = { color: '#60a5fa', textDecoration: 'underline' };

const reasonBannerStyle: React.CSSProperties = {
  background: 'rgba(246,183,60,0.08)',
  border: '1px solid rgba(246,183,60,0.25)',
  borderRadius: 8,
  padding: '10px 12px',
  color: '#ffcc70',
  fontSize: 12,
  marginBottom: 16,
};

const privacyBannerStyle: React.CSSProperties = {
  background: 'rgba(34,197,94,0.06)',
  border: '1px solid rgba(34,197,94,0.2)',
  borderRadius: 8,
  padding: '12px 14px',
  fontSize: 12,
  lineHeight: 1.5,
  marginBottom: 18,
};

const actionRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  marginTop: 20,
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#f5f1e8',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: 'rgba(246,183,60,0.15)',
  border: '1px solid rgba(246,183,60,0.4)',
  borderRadius: 8,
  color: '#ffcc70',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const dangerBtnStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: 'transparent',
  border: '1px solid rgba(248,113,113,0.25)',
  borderRadius: 8,
  color: '#f87171',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const testStatusStyle: React.CSSProperties = {
  marginTop: 12,
  fontSize: 12,
};
