import { useState, useRef, useEffect, useCallback } from 'react';

interface HistoricalFigure {
  id: string;
  name: string;
  years: string;
  emoji: string;
  bio: string;
  accentColor: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  onNavigate?: (year: number, span: number) => void;
  onClose?: () => void;
}

const FIGURES: HistoricalFigure[] = [
  { id: 'cleopatra', name: 'Cleopatra VII', years: '69-30 BCE', emoji: '\ud83d\udc51', bio: 'Last active ruler of the Ptolemaic Kingdom of Egypt', accentColor: '#daa520' },
  { id: 'julius-caesar', name: 'Julius Caesar', years: '100-44 BCE', emoji: '\ud83c\udff0', bio: 'Roman dictator who transformed the Republic', accentColor: '#dc143c' },
  { id: 'da-vinci', name: 'Leonardo da Vinci', years: '1452-1519', emoji: '\ud83c\udfa8', bio: 'Renaissance polymath, painter, and inventor', accentColor: '#ff8c00' },
  { id: 'genghis-khan', name: 'Genghis Khan', years: '1162-1227', emoji: '\u2694\ufe0f', bio: 'Founder of the Mongol Empire, largest contiguous land empire', accentColor: '#8b4513' },
  { id: 'elizabeth-i', name: 'Queen Elizabeth I', years: '1533-1603', emoji: '\ud83d\udc78', bio: 'Queen of England during the Elizabethan Golden Age', accentColor: '#9370db' },
  { id: 'napoleon', name: 'Napoleon Bonaparte', years: '1769-1821', emoji: '\ud83c\udf1f', bio: 'French military leader who conquered much of Europe', accentColor: '#4169e1' },
  { id: 'franklin', name: 'Benjamin Franklin', years: '1706-1790', emoji: '\u26a1', bio: 'Founding Father, scientist, diplomat, and inventor', accentColor: '#228b22' },
  { id: 'curie', name: 'Marie Curie', years: '1867-1934', emoji: '\u2622\ufe0f', bio: 'Pioneer of radioactivity research, first woman to win a Nobel Prize', accentColor: '#20b2aa' },
  { id: 'tesla', name: 'Nikola Tesla', years: '1856-1943', emoji: '\ud83d\udca1', bio: 'Inventor of alternating current and visionary electrical engineer', accentColor: '#00bfff' },
  { id: 'gandhi', name: 'Mahatma Gandhi', years: '1869-1948', emoji: '\u2638\ufe0f', bio: 'Leader of Indian independence through nonviolent resistance', accentColor: '#ff69b4' },
  { id: 'einstein', name: 'Albert Einstein', years: '1879-1955', emoji: '\ud83e\udde0', bio: 'Physicist who developed the theory of relativity', accentColor: '#a78bfa' },
  { id: 'lovelace', name: 'Ada Lovelace', years: '1815-1852', emoji: '\ud83d\udcbb', bio: 'Mathematician and first computer programmer', accentColor: '#ec4899' },
];

function getFigureEra(figure: HistoricalFigure): { year: number; span: number } {
  const match = figure.years.match(/(\d+)/);
  const firstYear = match ? parseInt(match[1], 10) : 0;
  const isBCE = figure.years.includes('BCE');
  const year = isBCE ? -firstYear : firstYear;
  return { year, span: 100 };
}

export default function FigureChat({ onNavigate, onClose }: Props) {
  const [selectedFigure, setSelectedFigure] = useState<HistoricalFigure | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startConversation = useCallback((figure: HistoricalFigure) => {
    setSelectedFigure(figure);
    setMessages([{
      role: 'assistant',
      content: `Greetings! I am ${figure.name}. I lived during ${figure.years}. Ask me anything about my life, my era, or the world as I knew it. What would you like to know?`,
    }]);
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !selectedFigure || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const history = messages.slice(-12).map(m => ({ role: m.role, content: m.content }));

      const resp = await fetch('/api/figures/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          figureName: selectedFigure.name,
          messages: [...history, { role: 'user', content: text }],
        }),
      });

      if (resp.status === 429) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Too many requests. Please wait a moment and try again.',
        }]);
        setLoading(false);
        return;
      }

      const data = await resp.json();
      const content = data.content || 'I am at a loss for words. Perhaps ask me something else?';

      setMessages(prev => [...prev, { role: 'assistant', content }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'I seem to have lost my connection to the present. Please try again.',
      }]);
    } finally {
      setLoading(false);
    }
  }, [messages, selectedFigure, loading]);

  const handleBack = useCallback(() => {
    setSelectedFigure(null);
    setMessages([]);
    setInput('');
  }, []);

  return (
    <div style={{
      position: 'absolute',
      bottom: 20,
      right: 20,
      width: 420,
      maxWidth: 'calc(100vw - 40px)',
      height: selectedFigure ? 540 : 'auto',
      maxHeight: 'calc(100vh - 100px)',
      background: 'rgba(13, 17, 23, 0.95)',
      borderRadius: 16,
      border: '1px solid rgba(255,255,255,0.08)',
      backdropFilter: 'blur(20px)',
      boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
      zIndex: 50,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        {selectedFigure && (
          <button
            onClick={handleBack}
            style={{
              background: 'none', border: 'none', color: '#ffffff60',
              fontSize: 16, cursor: 'pointer', padding: '0 4px',
            }}
          >{'\u2190'}</button>
        )}
        <span style={{ fontSize: 20 }}>{selectedFigure?.emoji || '\ud83c\udfad'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>
            {selectedFigure ? selectedFigure.name : 'Historical Figures'}
          </div>
          <div style={{ color: '#ffffff50', fontSize: 10, fontFamily: 'monospace' }}>
            {selectedFigure ? selectedFigure.years : 'Chat with history\'s greatest minds'}
          </div>
        </div>
        {selectedFigure && onNavigate && (
          <button
            onClick={() => {
              const era = getFigureEra(selectedFigure);
              onNavigate(era.year, era.span);
            }}
            style={{
              background: `rgba(${hexToRgb(selectedFigure.accentColor)}, 0.15)`,
              border: `1px solid rgba(${hexToRgb(selectedFigure.accentColor)}, 0.3)`,
              borderRadius: 6, padding: '4px 10px',
              color: selectedFigure.accentColor,
              fontSize: 11, fontWeight: 500, cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            View their era
          </button>
        )}
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', color: '#ffffff60',
            fontSize: 18, cursor: 'pointer', padding: 4,
          }}
        >{'\u2715'}</button>
      </div>

      {/* EDUCATIONAL FICTION banner */}
      {selectedFigure && (
        <div style={{
          padding: '6px 18px',
          background: 'rgba(251, 191, 36, 0.1)',
          borderBottom: '1px solid rgba(251, 191, 36, 0.2)',
          color: '#fbbf24',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 0.5,
          textAlign: 'center',
        }}>
          EDUCATIONAL FICTION — Creative interpretation, not the real person
        </div>
      )}

      {/* Figure selection grid */}
      {!selectedFigure && (
        <div style={{
          padding: 16,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          overflowY: 'auto',
        }}>
          {FIGURES.map(figure => (
            <button
              key={figure.id}
              onClick={() => startConversation(figure)}
              style={{
                background: `rgba(${hexToRgb(figure.accentColor)}, 0.08)`,
                border: `1px solid rgba(${hexToRgb(figure.accentColor)}, 0.2)`,
                borderRadius: 12,
                padding: '12px 8px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = `rgba(${hexToRgb(figure.accentColor)}, 0.15)`;
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = `rgba(${hexToRgb(figure.accentColor)}, 0.08)`;
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <span style={{ fontSize: 28 }}>{figure.emoji}</span>
              <span style={{ color: '#ffffffcc', fontSize: 11, fontWeight: 600, textAlign: 'center' }}>
                {figure.name}
              </span>
              <span style={{ color: '#ffffff50', fontSize: 9, fontFamily: 'monospace' }}>
                {figure.years}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Chat interface */}
      {selectedFigure && (
        <>
          {/* Messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '14px 18px',
          }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  marginBottom: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div style={{
                  background: msg.role === 'user'
                    ? 'rgba(59, 130, 246, 0.2)'
                    : `rgba(${hexToRgb(selectedFigure.accentColor)}, 0.1)`,
                  border: `1px solid ${msg.role === 'user'
                    ? 'rgba(59,130,246,0.3)'
                    : `rgba(${hexToRgb(selectedFigure.accentColor)}, 0.2)`}`,
                  borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  padding: '10px 14px',
                  maxWidth: '85%',
                  color: '#ffffffdd',
                  fontSize: 13,
                  lineHeight: 1.55,
                  whiteSpace: 'pre-wrap',
                }}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{
                color: '#ffffff50', fontSize: 12, padding: '8px 0',
              }}>
                {selectedFigure.name} is thinking...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '12px 18px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-end',
          }}>
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !loading) sendMessage(input);
              }}
              placeholder={`Ask ${selectedFigure.name} a question...`}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10,
                padding: '10px 14px',
                color: '#fff',
                fontSize: 13,
                outline: 'none',
              }}
            />
            <button
              onClick={() => !loading && sendMessage(input)}
              disabled={loading || !input.trim()}
              style={{
                background: loading || !input.trim()
                  ? 'rgba(255,255,255,0.05)'
                  : `rgba(${hexToRgb(selectedFigure.accentColor)}, 0.3)`,
                border: `1px solid ${selectedFigure.accentColor}55`,
                borderRadius: 10,
                padding: '10px 16px',
                color: '#fff',
                cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                fontSize: 14,
              }}
            >{'\u2192'}</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Convert a hex color like "#dc143c" to "220, 20, 60" for rgba() */
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}
