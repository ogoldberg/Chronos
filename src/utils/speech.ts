/**
 * Speech utilities — TTS output and STT input
 */

// ─── TTS (Text-to-Speech) ───

export function speak(text: string, onEnd?: () => void): void {
  if (!window.speechSynthesis) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.94;
  utterance.pitch = 1.02;
  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find(v => /Google.*US/i.test(v.name)) ||
    voices.find(v => /Samantha|Daniel|Google/i.test(v.name) && v.lang.startsWith('en')) ||
    voices.find(v => v.lang.startsWith('en'));
  if (preferred) utterance.voice = preferred;
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  window.speechSynthesis.speak(utterance);
}

export function stopSpeech(): void {
  window.speechSynthesis?.cancel();
}

export function isSpeaking(): boolean {
  return window.speechSynthesis?.speaking ?? false;
}

// ─── STT (Speech-to-Text) ───

export interface VoiceInputCallbacks {
  onTranscript: (text: string, isFinal: boolean) => void;
  onStateChange: (state: VoiceInputState) => void;
  onError?: (error: string) => void;
}

export type VoiceInputState = 'idle' | 'listening' | 'processing';

let recognition: any = null;
let isListening = false;

export function isVoiceInputSupported(): boolean {
  return !!(window.SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export function startVoiceInput(callbacks: VoiceInputCallbacks): void {
  if (!isVoiceInputSupported()) {
    callbacks.onError?.('Speech recognition not supported in this browser');
    return;
  }

  // Stop any existing session
  stopVoiceInput();

  const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isListening = true;
    callbacks.onStateChange('listening');
  };

  recognition.onresult = (event: any) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        finalTranscript += result[0].transcript;
      } else {
        interimTranscript += result[0].transcript;
      }
    }

    if (finalTranscript) {
      callbacks.onTranscript(finalTranscript.trim(), true);
    } else if (interimTranscript) {
      callbacks.onTranscript(interimTranscript.trim(), false);
    }
  };

  recognition.onerror = (event: any) => {
    if (event.error === 'no-speech' || event.error === 'aborted') return;
    callbacks.onError?.(event.error);
    callbacks.onStateChange('idle');
    isListening = false;
  };

  recognition.onend = () => {
    // Auto-restart if we're still supposed to be listening (continuous mode)
    if (isListening) {
      try {
        recognition.start();
      } catch {
        isListening = false;
        callbacks.onStateChange('idle');
      }
    } else {
      callbacks.onStateChange('idle');
    }
  };

  try {
    recognition.start();
  } catch {
    callbacks.onError?.('Failed to start speech recognition');
  }
}

export function stopVoiceInput(): void {
  isListening = false;
  if (recognition) {
    try {
      recognition.stop();
    } catch { /* noop */ }
    recognition = null;
  }
}

export function isVoiceListening(): boolean {
  return isListening;
}
