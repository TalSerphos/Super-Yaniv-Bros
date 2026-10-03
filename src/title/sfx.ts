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

export type Sfx = 'move' | 'ding' | 'back';

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
  }
}
