import { useState, useCallback, useEffect, useRef } from 'react';
import {
  isVoiceInputSupported,
  startVoiceInput,
  stopVoiceInput,
  stopSpeech,
  isSpeaking,
  type VoiceInputState,
} from '../utils/speech';

interface Props {
  onFinalTranscript: (text: string) => void;
  disabled?: boolean;
}

export default function VoiceButton({ onFinalTranscript, disabled }: Props) {
  const [state, setState] = useState<VoiceInputState>('idle');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const supported = isVoiceInputSupported();
  const silenceTimerRef = useRef<number>(0);
  const finalBufferRef = useRef('');

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVoiceInput();
      clearTimeout(silenceTimerRef.current);
    };
  }, []);

  const toggle = useCallback(() => {
    if (state === 'listening') {
      // Stop listening
      stopVoiceInput();
      setState('idle');
      setInterim('');
      clearTimeout(silenceTimerRef.current);
      // If we have buffered text, send it
      if (finalBufferRef.current.trim()) {
        onFinalTranscript(finalBufferRef.current.trim());
        finalBufferRef.current = '';
      }
      return;
    }

    // If AI is speaking, interrupt it
    if (isSpeaking()) {
      stopSpeech();
    }

    // Start listening
    setError('');
    finalBufferRef.current = '';
    startVoiceInput({
      onTranscript: (text, isFinal) => {
        if (isFinal) {
          finalBufferRef.current += (finalBufferRef.current ? ' ' : '') + text;
          setInterim('');

          // Auto-send after 1.5s of silence
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = window.setTimeout(() => {
            if (finalBufferRef.current.trim()) {
              stopVoiceInput();
              setState('idle');
              onFinalTranscript(finalBufferRef.current.trim());
              finalBufferRef.current = '';
            }
          }, 1500);
        } else {
          setInterim(text);
          // Reset silence timer on any speech activity
          clearTimeout(silenceTimerRef.current);
        }
      },
      onStateChange: setState,
      onError: (err) => {
        setError(err);
        setTimeout(() => setError(''), 3000);
      },
    });
  }, [state, onFinalTranscript]);

  if (!supported) return null;

  const isActive = state === 'listening';

  return (
    <div style={{ position: 'relative' }}>
      {/* Interim transcript preview */}
      {(interim || finalBufferRef.current) && isActive && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          right: -200,
          marginBottom: 8,
          background: 'rgba(13, 17, 23, 0.95)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: 10,
          padding: '8px 12px',
          fontSize: 12,
          color: '#ffffffcc',
          minWidth: 200,
          maxWidth: 300,
        }}>
          {finalBufferRef.current && (
            <span>{finalBufferRef.current} </span>
          )}
          {interim && (
            <span style={{ color: '#ffffff60', fontStyle: 'italic' }}>{interim}</span>
          )}
        </div>
      )}

      {/* Error tooltip */}
      {error && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          marginBottom: 8,
          background: 'rgba(220, 20, 60, 0.2)',
          border: '1px solid rgba(220, 20, 60, 0.3)',
          borderRadius: 8,
          padding: '4px 10px',
          fontSize: 11,
          color: '#ff6b6b',
          whiteSpace: 'nowrap',
        }}>
          {error}
        </div>
      )}

      {/* Mic button */}
      <button
        onClick={toggle}
        disabled={disabled}
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: isActive
            ? 'rgba(220, 20, 60, 0.3)'
            : 'rgba(255, 255, 255, 0.06)',
          border: `2px solid ${isActive ? 'rgba(220, 20, 60, 0.6)' : 'rgba(255,255,255,0.1)'}`,
          color: isActive ? '#ff4444' : '#ffffff80',
          fontSize: 18,
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s',
          position: 'relative',
          overflow: 'hidden',
        }}
        title={isActive ? 'Stop listening' : 'Start voice input'}
      >
        {/* Pulse ring when listening */}
        {isActive && (
          <div style={{
            position: 'absolute',
            inset: -4,
            borderRadius: '50%',
            border: '2px solid rgba(220, 20, 60, 0.4)',
            animation: 'voicePulse 1.5s ease-in-out infinite',
          }} />
        )}
        🎙️
      </button>
    </div>
  );
}
