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
