import { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatMessage, Viewport, TimelineEvent, TourStop } from '../../types';
import { formatYear, formatYearShort, scaleLabel } from '../../utils/format';
import { speak, stopSpeech, isSpeaking } from '../../utils/speech';
import VoiceButton from '../../components/VoiceButton';

interface Props {
  viewport: Viewport;
  visibleEvents: TimelineEvent[];
  selectedEvent: TimelineEvent | null;
  onNavigate: (year: number, span: number) => void;
  onStartTour: (stops: TourStop[]) => void;
  onAddEvents: (events: TimelineEvent[]) => void;
  initialMessage?: string;
}

const QUICK_PROMPTS = [
  "What am I looking at?",
  "How does this connect to today?",
  "Tour this era",
  "Explain like I'm 10",
  "Go deeper — PhD level",
];

export default function ChatPanel({
  viewport,
  visibleEvents,
  selectedEvent,
  onNavigate,
  onStartTour,
  onAddEvents,
  initialMessage,
}: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: "Welcome to CHRONOS! I'm your history guide. Ask me anything — from \"why did Rome fall?\" to \"show me the evolution of flight.\" I'll take you there on the timeline and explain along the way.\n\nYou can ask me to adapt: say \"explain like I'm 5\" or \"go deep, PhD level.\" Try: *\"Take me on a tour of ancient civilizations\"*",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (initialMessage) {
      setOpen(true);
      sendMessage(initialMessage);
    }
  }, [initialMessage]);

  const buildContext = useCallback(() => {
    const left = viewport.centerYear - viewport.span / 2;
    const right = viewport.centerYear + viewport.span / 2;
    const evtList = visibleEvents
      .slice(0, 15)
      .map(e => `${e.emoji} ${e.title} (${formatYearShort(e.year)})`)
      .join(', ');

    return `- Viewing: ${formatYear(left)} to ${formatYear(right)}
- Center: ${formatYear(viewport.centerYear)} | Scale: ${scaleLabel(viewport.span)}
- Visible events: ${evtList || '(none at this zoom)'}
${selectedEvent ? `- Currently selected: ${selectedEvent.title} (${formatYear(selectedEvent.year)})` : ''}`;
  }, [viewport, visibleEvents, selectedEvent]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;
    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const history = messages.slice(-12).map(m => ({ role: m.role, content: m.content }));

      // Stream the response token by token
      let content = '';

      const resp = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...history, { role: 'user', content: text }],
          context: buildContext(),
        }),
      });

      if (!resp.ok || !resp.body) {
        // Fallback to non-streaming
        const fallback = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...history, { role: 'user', content: text }],
            context: buildContext(),
          }),
        });
        const data = await fallback.json();
        content = data.content || "Sorry, I had trouble connecting. Try again?";
      } else {
        // Add empty assistant message that we'll stream into
        setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.token) {
                content += data.token;
                // Update the streaming message in place
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: 'assistant', content };
                  return updated;
                });
              }
              if (data.error) {
                content = data.error;
              }
            } catch { /* skip */ }
          }
        }
        // Keep streaming message — we'll update it in-place after processing tags
      }

      if (!content) content = "Sorry, I had trouble connecting. Try again?";
      const wasStreaming = resp.ok && resp.body;

      // Extract GOTO commands
      const gotoMatches = [...content.matchAll(/\[\[GOTO:([-\d.e]+),([-\d.e]+)\]\]/g)];
      gotoMatches.forEach((m: RegExpMatchArray) => {
        content = content.replace(m[0], '');
        const y = parseFloat(m[1]);
        const s = parseFloat(m[2]);
        if (!isNaN(y) && !isNaN(s)) {
          setTimeout(() => onNavigate(y, s), 500);
        }
      });

      // Extract events to persist to timeline
      const eventsMatch = content.match(/\[\[EVENTS:(\[[\s\S]*?\])\]\]/);
      if (eventsMatch) {
        content = content.replace(eventsMatch[0], '').trim();
        try {
          const rawEvents = JSON.parse(eventsMatch[1]);
          if (Array.isArray(rawEvents) && rawEvents.length > 0) {
            const newEvents: TimelineEvent[] = rawEvents
              .filter((e: any) => e.title && e.year != null)
              .map((e: any, i: number) => ({
                id: `chat-${Date.now()}-${i}`,
                title: e.title,
                year: e.year,
                emoji: e.emoji || '📌',
                color: e.color || '#888',
                description: e.description || '',
                category: e.category || 'civilization',
                source: 'discovered' as const,
                wiki: e.wiki,
                lat: e.lat,
                lng: e.lng,
                geoType: e.geoType,
                path: e.path,
                region: e.region,
              }));
            if (newEvents.length > 0) {
              onAddEvents(newEvents);
            }
          }
        } catch (e) {
          console.error('Events parse error:', e);
        }
      }

      // Extract tour
      const tourMatch = content.match(/\[\[TOUR:(\[[\s\S]*?\])\]\]/);
      if (tourMatch) {
        content = content.replace(tourMatch[0], '').trim();
        try {
          const stops = JSON.parse(tourMatch[1]) as TourStop[];
          if (Array.isArray(stops) && stops.length > 0) {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: content || "Starting your tour! Sit back and enjoy.",
            }]);
            setTimeout(() => onStartTour(stops), 1500);
            setLoading(false);
            return;
          }
        } catch (e) {
          console.error('Tour parse error:', e);
        }
      }

      const cleanContent = content.trim();
      if (wasStreaming) {
        // Update the streaming message in place (no flicker)
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: cleanContent };
          return updated;
        });
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: cleanContent }]);
      }

      // Auto-speak response in voice mode
      if (voiceMode && cleanContent) {
        // Truncate for TTS — speak first ~400 chars
        const speakText = cleanContent.length > 400
          ? cleanContent.slice(0, 400).replace(/\s\S*$/, '') + '...'
          : cleanContent;
        speak(speakText);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I had trouble connecting. Try again?" }]);
    } finally {
      setLoading(false);
    }
  }, [messages, buildContext, onNavigate, onStartTour, onAddEvents, voiceMode]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'absolute',
          bottom: 20,
          right: 20,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: 'rgba(13, 17, 23, 0.9)',
          border: '1px solid rgba(255,255,255,0.15)',
          color: '#fff',
          fontSize: 24,
          cursor: 'pointer',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          zIndex: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 0.2s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        💬
      </button>
    );
  }

  return (
    <div style={{
      position: 'absolute',
      bottom: 20,
      right: 20,
      width: 400,
      maxWidth: 'calc(100vw - 40px)',
      height: 520,
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
        <span style={{ fontSize: 20 }}>🧭</span>
        <div>
          <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>CHRONOS Guide</div>
          <div style={{ color: '#ffffff50', fontSize: 10, fontFamily: 'monospace' }}>
            AI History Companion
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Voice mode toggle */}
          <button
            onClick={() => {
              const next = !voiceMode;
              setVoiceMode(next);
              if (!next) stopSpeech();
            }}
            style={{
              background: voiceMode ? 'rgba(59,130,246,0.2)' : 'none',
              border: `1px solid ${voiceMode ? 'rgba(59,130,246,0.4)' : 'transparent'}`,
              borderRadius: 6,
              color: voiceMode ? '#3b82f6' : '#ffffff40',
              fontSize: 14,
              cursor: 'pointer',
              padding: '2px 6px',
            }}
            title={voiceMode ? 'Voice mode on — responses are spoken' : 'Voice mode off'}
          >
            {voiceMode ? '🔊' : '🔇'}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              color: '#ffffff60',
              fontSize: 18,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>
      </div>

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
                : 'rgba(255,255,255,0.04)',
              border: `1px solid ${msg.role === 'user' ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.06)'}`,
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
            color: '#ffffff50',
            fontSize: 12,
            padding: '8px 0',
          }}>
            Thinking...
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Quick prompts */}
      <div style={{
        padding: '8px 18px',
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
        borderTop: '1px solid rgba(255,255,255,0.04)',
      }}>
        {QUICK_PROMPTS.map(prompt => (
          <button
            key={prompt}
            onClick={() => !loading && sendMessage(prompt)}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              padding: '4px 10px',
              color: '#ffffff80',
              fontSize: 11,
              cursor: loading ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Input */}
      <div style={{
        padding: '12px 18px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        gap: 8,
        alignItems: 'flex-end',
      }}>
        <VoiceButton
          onFinalTranscript={(text) => {
            if (!loading) {
              setVoiceMode(true); // auto-enable voice mode when using mic
              sendMessage(text);
            }
          }}
          disabled={loading}
        />
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !loading) sendMessage(input);
          }}
          placeholder="Ask about any era, event, or connection..."
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
            background: loading || !input.trim() ? 'rgba(255,255,255,0.05)' : 'rgba(59, 130, 246, 0.3)',
            border: '1px solid rgba(59,130,246,0.3)',
            borderRadius: 10,
            padding: '10px 16px',
            color: '#fff',
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
            fontSize: 14,
          }}
        >
          →
        </button>
      </div>
    </div>
  );
}
