// Voice in and out. Brain lessons applied:
// - pin identical voice settings on every chunk; stateless engines drift.
// - drive the "talking" visual from the engine's real start/end events,
//   never from an estimated reading time.

// Turn any reply into something a TTS engine reads cleanly.
export function toSpeech(text) {
  return String(text)
    .replace(/https?:\/\/\S+/g, 'the link on screen')
    .replace(/[*_`#>~|]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/(\d+)\s*°\s*F?/g, '$1 degrees')
    .replace(/(\d+)\s*%/g, '$1 percent')
    .replace(/(\d+)\s*[-–]\s*(\d+)/g, '$1 to $2')
    .replace(/(\d+)\s*"/g, '$1 inches')
    .replace(/(\d+)\s*(?:'|ft\b)/g, '$1 feet')
    .replace(/(\d+)\s*gal\b/g, '$1 gallons')
    .replace(/\be\.g\./gi, 'for example')
    .replace(/&/g, ' and ')
    .replace(/([a-z])\s*\/\s*([a-z])/gi, '$1 or $2')
    .replace(/\s+/g, ' ')
    .trim();
}

// Split into sentences so long replies do not get cut off on mobile engines.
export function chunks(text) {
  return toSpeech(text).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

export function createVoice({ onStart, onEnd } = {}) {
  const synth = globalThis.speechSynthesis;
  let settings = { rate: 1, voiceName: '' };
  let pending = 0;

  function pickVoice() {
    const vs = synth?.getVoices() || [];
    return vs.find((v) => v.name === settings.voiceName) ||
           vs.find((v) => /en[-_]US/i.test(v.lang) && /natural|neural|samantha|google/i.test(v.name)) ||
           vs.find((v) => /^en/i.test(v.lang)) || null;
  }

  return {
    supported: !!synth,
    voices: () => synth?.getVoices() || [],
    configure(s) { settings = { ...settings, ...s }; },
    stop() { synth?.cancel(); pending = 0; onEnd?.(); },
    speak(text) {
      if (!synth) return;
      synth.cancel();
      const parts = chunks(text);
      pending = parts.length;
      const voice = pickVoice();
      parts.forEach((p, i) => {
        const u = new SpeechSynthesisUtterance(p);
        if (voice) u.voice = voice;
        u.rate = settings.rate; u.pitch = 1.05; u.volume = 1;
        if (i === 0) u.onstart = () => onStart?.();
        u.onend = u.onerror = () => { if (--pending <= 0) onEnd?.(); };
        synth.speak(u);
      });
    },
  };
}

export function createEars({ onText, onState } = {}) {
  const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  if (!SR) return { supported: false, start() {}, stop() {} };
  const rec = new SR();
  rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1;
  rec.onresult = (e) => onText?.(e.results[0][0].transcript);
  rec.onstart = () => onState?.(true);
  rec.onend = rec.onerror = () => onState?.(false);
  return { supported: true, start: () => { try { rec.start(); } catch {} }, stop: () => rec.stop() };
}
