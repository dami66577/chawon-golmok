// 《차원골목 식당》 8비트 효과음
// 소리 파일 없이 브라우저가 직접 네모파를 만든다. 첫 터치 뒤에만 소리가 난다(브라우저 규칙).
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('isekai-diner-mute') === '1'; } catch { /* 기본은 켜짐 */ }

export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; }
}
export const isMuted = () => muted;
export function setMuted(v) {
  muted = v;
  try { localStorage.setItem('isekai-diner-mute', v ? '1' : '0'); } catch { /* 괜찮아 */ }
}

// notes: [주파수, 길이(초)] 순서대로
function play(notes, { type = 'square', vol = 0.06, gap = 0 } = {}) {
  if (muted || !ctx) return;
  let t = ctx.currentTime + 0.01;
  for (const [f, d] of notes) {
    if (f > 0) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + d + 0.02);
    }
    t += d + gap;
  }
}

let lastCoin = 0;
export const sfx = {
  tap: () => play([[660, 0.04]], { vol: 0.04 }),
  open: () => play([[523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.16]], { gap: 0.01 }),
  order: () => play([[880, 0.03], [1175, 0.04]], { vol: 0.03 }),
  coin: () => {
    const now = performance.now();
    if (now - lastCoin < 90) return; // 4배속에서 소리가 뭉치지 않게
    lastCoin = now;
    play([[988, 0.05], [1319, 0.12]], { vol: 0.05 });
  },
  great: () => play([[1047, 0.05], [1319, 0.05], [1568, 0.1]], { vol: 0.045 }),
  angry: () => play([[196, 0.09], [147, 0.16]], { type: 'sawtooth', vol: 0.05 }),
  levelUp: () => play([[523, 0.07], [659, 0.07], [784, 0.07], [1047, 0.07], [1319, 0.22]], { gap: 0.02 }),
  close: () => play([[784, 0.12], [659, 0.12], [523, 0.24]], { gap: 0.02, vol: 0.05 }),
  sheet: () => play([[440, 0.03], [587, 0.05]], { vol: 0.03 }),
};

// ---------- 배경음악 ----------
// 소리 파일 없이 만드는 8마디 반복곡. 세모파 멜로디 + 세모파 베이스, 아주 작게.
let bgmOn = true;
try { bgmOn = localStorage.getItem('isekai-diner-bgm') !== '0'; } catch { /* 기본은 켜짐 */ }
const N = { A2: 110, F2: 87.31, G2: 98, C3: 130.81, A4: 440, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5 };
const MELODY = [
  'E5', 'G5', 'A5', 'G5', 'E5', 'D5', 'C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'A5', 'G5', 'E5', 0,
  'D5', 'E5', 'G5', 'E5', 'D5', 'C5', 'A4', 'C5', 'D5', 'E5', 'D5', 'C5', 'C5', 0, 0, 0,
];
const BASS = ['C3', 'A2', 'F2', 'G2'];
const STEP = 60 / 132 / 2; // 8분음표
let bgmTimer = null, bgmStep = 0, bgmNext = 0;

function note(freq, at, dur, vol, type = 'triangle') {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(ctx.destination);
  o.start(at); o.stop(at + dur + 0.02);
}
function schedule() {
  if (!ctx) return;
  while (bgmNext < ctx.currentTime + 0.25) {
    const m = MELODY[bgmStep % MELODY.length];
    if (m) note(N[m], bgmNext, STEP * 0.9, 0.028);
    if (bgmStep % 4 === 0) note(N[BASS[Math.floor(bgmStep / 8) % BASS.length]], bgmNext, STEP * 3.5, 0.045);
    bgmNext += STEP;
    bgmStep++;
  }
}
export const isBgmOn = () => bgmOn;
export function startBgm() {
  if (!ctx || !bgmOn || bgmTimer) return;
  bgmNext = ctx.currentTime + 0.1;
  bgmTimer = setInterval(schedule, 60);
}
export function stopBgm() { clearInterval(bgmTimer); bgmTimer = null; }
export function setBgm(v) {
  bgmOn = v;
  try { localStorage.setItem('isekai-diner-bgm', v ? '1' : '0'); } catch { /* 괜찮아 */ }
  if (v) startBgm(); else stopBgm();
}
