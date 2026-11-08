// Minimal WebAudio synth (dosyasız sesler). Vanilla MC seslerine yaklaştırılmış.
// Ses seviyesi window.gameSettings.volume (0-100) üzerinden kısma.

let ctx = null;
function audioCtx() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  return ctx;
}
function masterGain(pct) {
  const v = Math.max(0, Math.min(100, typeof pct === 'number' ? pct : 100)) / 100;
  return v * v; // MC hissi: %50 = yarı güç
}

export function playIgnite() {
  const a = audioCtx(); if (!a) return;
  const t0 = a.currentTime;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(1400, t0);
  o.frequency.exponentialRampToValueAtTime(600, t0 + 0.06);
  g.gain.setValueAtTime(0.12 * masterGain(window.gameSettings?.volume), t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
  o.connect(g).connect(a.destination);
  o.start(t0); o.stop(t0 + 0.1);
}

export function playExplode() {
  const a = audioCtx(); if (!a) return;
  const t0 = a.currentTime;
  const dur = 1.1;
  // Beyaz gürültü -> alçak geçiren filtre -> sönümlenen gövde + sub-bass vuruşu
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const k = i / len;
    d[i] = (Math.random() * 2 - 1) * Math.pow(1 - k, 2.2);
  }
  const src = a.createBufferSource();
  src.buffer = buf;
  const lp = a.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900, t0);
  lp.frequency.exponentialRampToValueAtTime(120, t0 + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.9 * masterGain(window.gameSettings?.volume), t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(lp).connect(g).connect(a.destination);
  src.start(t0);

  const o = a.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(90, t0);
  o.frequency.exponentialRampToValueAtTime(38, t0 + dur);
  const g2 = a.createGain();
  g2.gain.setValueAtTime(0.8 * masterGain(window.gameSettings?.volume), t0);
  g2.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g2).connect(a.destination);
  o.start(t0); o.stop(t0 + dur);
}

// Fırın/vOKish küçük tıklanışlar için yer tutucu (ileride gerekirse)
export function playClick() {
  const a = audioCtx(); if (!a) return;
  const t0 = a.currentTime;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(900, t0);
  g.gain.setValueAtTime(0.08 * masterGain(window.gameSettings?.volume), t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
  o.connect(g).connect(a.destination);
  o.start(t0); o.stop(t0 + 0.06);
}
