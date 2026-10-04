/** Tiny Web Audio synth for UI sounds: no audio files to download. */

const MUTE_KEY = 'syb.muted';

let ctx: AudioContext | undefined;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    /* storage unavailable (private mode): keep in memory only */
  }
}

/** Must be called from a user gesture at least once (iOS/Chrome autoplay rules). */
export function unlockAudio(): void {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number): void {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(0, start);
  amp.gain.linearRampToValueAtTime(gain, start + 0.005);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(amp).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function sweep(from: number, to: number, start: number, dur: number, type: OscillatorType, gain: number): void {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(to, start + dur);
  amp.gain.setValueAtTime(gain, start);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(amp).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

export type Sfx = 'move' | 'ding' | 'back' | 'jump' | 'nut' | 'stomp' | 'hurt' | 'bump' | 'thwop' | 'chime' | 'warn';

export function play(sfx: Sfx): void {
  if (muted || !ctx) return;
  // iOS starts the context suspended and resume() settles asynchronously: play once it runs,
  // otherwise the very first ding (on the unlocking tap) would be dropped.
  if (ctx.state !== 'running') {
    void ctx.resume().then(() => synth(sfx));
    return;
  }
  synth(sfx);
}

function synth(sfx: Sfx): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  switch (sfx) {
    case 'move':
      tone(880, t, 0.06, 'square', 0.05);
      break;
    case 'ding': // the flight-attendant call chime
      tone(1175, t, 1.1, 'sine', 0.22);
      tone(2350, t, 0.5, 'sine', 0.05);
      tone(3525, t, 0.25, 'sine', 0.02);
      break;
    case 'back':
      tone(660, t, 0.07, 'square', 0.05);
      tone(440, t + 0.07, 0.1, 'square', 0.05);
      break;
    case 'jump':
      sweep(330, 760, t, 0.14, 'square', 0.05);
      break;
    case 'nut': // a short, high flight-attendant ding: the coin sound
      tone(1568, t, 0.25, 'sine', 0.12);
      tone(2093, t + 0.05, 0.3, 'sine', 0.08);
      break;
    case 'stomp':
      sweep(420, 90, t, 0.16, 'square', 0.08);
      break;
    case 'hurt':
      sweep(500, 120, t, 0.35, 'sawtooth', 0.06);
      break;
    case 'bump':
      tone(180, t, 0.08, 'square', 0.08);
      break;
    case 'thwop': // plunger
      sweep(200, 70, t, 0.12, 'triangle', 0.12);
      break;
    case 'chime': // seatbelt sign off: the two-tone cabin chime
      tone(1046, t, 0.9, 'sine', 0.18);
      tone(784, t + 0.45, 1.2, 'sine', 0.18);
      break;
    case 'warn':
      tone(988, t, 0.08, 'square', 0.05);
      tone(988, t + 0.14, 0.08, 'square', 0.05);
      break;
  }
}
