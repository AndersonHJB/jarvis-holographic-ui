
// Audio Context Singleton
let audioCtx: AudioContext | null = null;
let voicesLoaded = false;

const getCtx = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
};

// Preload voices to avoid silence on first speak
if (typeof window !== 'undefined' && window.speechSynthesis) {
  const checkVoices = () => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      voicesLoaded = true;
    }
  };
  checkVoices();
  window.speechSynthesis.onvoiceschanged = checkVoices;
}

// 1. Sound Effects (Oscillators)
export const playSound = (type: 'boot' | 'blip' | 'scan' | 'error' | 'charge' | 'explosion') => {
  const ctx = getCtx();
  if (ctx.state === 'suspended') ctx.resume();

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;

  switch (type) {
    case 'boot':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(100, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.5);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 1.5);
      osc.start(now);
      osc.stop(now + 1.5);
      break;
      
    case 'blip':
      osc.type = 'square';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.05);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
      break;

    case 'scan':
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, now);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
      break;

    case 'error':
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(100, now);
      osc.frequency.linearRampToValueAtTime(50, now + 0.3);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
      break;

    case 'charge':
      // Rising pitch for charging weapon
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(100, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 1.5);
      // Add a second layer for texture
      const osc2 = ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(50, now);
      osc2.frequency.linearRampToValueAtTime(200, now + 1.5);
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.5, now + 1.5);
      gain2.gain.setValueAtTime(0, now);
      gain2.gain.linearRampToValueAtTime(0.2, now + 1.5);
      
      osc.start(now);
      osc.stop(now + 1.5);
      osc2.start(now);
      osc2.stop(now + 1.5);
      break;

    case 'explosion':
      // 1. Sub-bass impact (The Earthquake)
      const subOsc = ctx.createOscillator();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(80, now); // Slightly higher start
      subOsc.frequency.exponentialRampToValueAtTime(10, now + 3.0); // Deep drop
      const subGain = ctx.createGain();
      subOsc.connect(subGain);
      subGain.connect(ctx.destination);
      subGain.gain.setValueAtTime(1.5, now);
      subGain.gain.exponentialRampToValueAtTime(0.01, now + 3.0);
      subOsc.start(now);
      subOsc.stop(now + 3.0);

      // 2. White noise blast (The Fire)
      const bufferSize = ctx.sampleRate * 2.5; 
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2); // Non-linear decay
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1000, now);
      filter.frequency.exponentialRampToValueAtTime(50, now + 2.0);
      
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(2.0, now); // Louder
      noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 2.0);
      
      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(now);
      break;
  }
};

// 2. Text to Speech (JARVIS Voice)
// Keep a reference to prevent Garbage Collection
let currentUtterance: SpeechSynthesisUtterance | null = null;

export const speak = (text: string) => {
  if (!window.speechSynthesis) return;
  
  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  currentUtterance = new SpeechSynthesisUtterance(text);
  currentUtterance.rate = 1.0; 
  currentUtterance.pitch = 0.8; 
  currentUtterance.volume = 1.0;

  // Try to find a Chinese voice, preferably Microsoft YaHei or Google Putonghua
  const voices = window.speechSynthesis.getVoices();
  const zhVoice = voices.find(v => v.lang === 'zh-CN' || v.lang.includes('zh'));
  
  if (zhVoice) {
    currentUtterance.voice = zhVoice;
  }

  // Prevent GC by clearing the reference only after speaking
  currentUtterance.onend = () => {
    currentUtterance = null;
  };

  window.speechSynthesis.speak(currentUtterance);
};
