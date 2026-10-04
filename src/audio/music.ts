/**
 * A tiny chiptune sequencer: original tracks written as note strings, scheduled ahead on the Web Audio
 * clock (square lead, triangle bass, noise drums). No audio files, nothing to download.
 *
 * Note strings: one token per eighth note. "A4" = note, "-" = hold the previous note, "." = rest.
 * Drums: "k" kick, "s" snare, "h" hi-hat, "." rest.
 */
import { audioContext, isMuted } from './sfx.ts';

interface Song {
  bpm: number;
  lead: string;
  bass: string;
  drums: string;
}

// World 5 cabin theme: A minor, tense but bouncy (original melody).
const CABIN: Song = {
  bpm: 132,
  lead: `A4 . C5 . E5 . D5 C5  B4 . G4 . E4 - - .  A4 . C5 . E5 . G5 F5  E5 - - . D5 . C5 .
         F4 . A4 . C5 . B4 A4  G4 . B4 . D5 - - .  E5 . D5 . C5 . B4 .   A4 - - . E4 . G#4 .`,
  bass: `A2 . A3 . A2 . A3 .  E2 . E3 . E2 . E3 .  A2 . A3 . A2 . A3 .  C3 . C4 . G2 . G3 .
         F2 . F3 . F2 . F3 .  G2 . G3 . G2 . G3 .  A2 . A3 . E2 . E3 .  A2 . A3 . E2 . G#2 .`,
  drums: 'k . h . s . h . '.repeat(8),
};

// 5-4 alarm theme: faster, with a siren motif in the lead.
const ALARM: Song = {
  bpm: 152,
  lead: `A5 G#5 A5 G#5 A5 G#5 A5 .  E5 . F5 . E5 . D5 .  A5 G#5 A5 G#5 A5 G#5 A5 .  C6 . B5 . A5 - - .
         D5 . F5 . A5 . G5 F5  E5 . G#5 . B5 - - .  A5 . E5 . C5 . E5 .  A4 - - . . . . .`,
  bass: `A2 A2 A3 A2 A2 A2 A3 A2  D2 D2 D3 D2 E2 E2 E3 E2  A2 A2 A3 A2 A2 A2 A3 A2  F2 F2 F3 F2 E2 E2 E3 E2
         D2 D2 D3 D2 D2 D2 D3 D2  E2 E2 E3 E2 E2 E2 E3 E2  A2 A2 A3 A2 E2 E2 E3 E2  A2 . A3 . A2 . . .`,
  drums: 'k h s h k k s h '.repeat(8),
};

const SONGS = { cabin: CABIN, alarm: ALARM };
export type SongName = keyof typeof SONGS;

const NOTE = /^([A-G])(#?)(\d)$/;
const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Frequency of "A4"-style notes (A4 = 440 Hz). Exported for tests. */
export function noteFreq(token: string): number | null {
  const m = NOTE.exec(token);
  if (!m) return null;
  const midi = 12 * (Number(m[3]) + 1) + SEMI[m[1]] + (m[2] ? 1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

const tokens = (s: string) => s.trim().split(/\s+/);

class Music {
  private song: Song | null = null;
  private step = 0;
  private nextTime = 0;
  private timer = 0;
  private noise: AudioBuffer | null = null;
  private master: GainNode | null = null;

  play(name: SongName): void {
    this.stop();
    this.song = SONGS[name];
    this.step = 0;
    this.resume();
  }

  pause(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
  }

  resume(): void {
    const ctx = audioContext();
    if (!this.song || !ctx || this.timer) return;
    this.nextTime = ctx.currentTime + 0.05;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop(): void {
    this.pause();
    this.song = null;
    this.master?.disconnect();
    this.master = null;
  }

  private schedule(): void {
    const ctx = audioContext();
    const song = this.song;
    if (!ctx || !song) return;
    if (!this.master) {
      this.master = ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(ctx.destination);
    }
    const stepDur = 60 / song.bpm / 2; // eighth notes
    const lead = tokens(song.lead);
    const bass = tokens(song.bass);
    const drums = song.drums.replace(/\s+/g, '').split('');
    // Schedule everything due in the next 120 ms.
    while (this.nextTime < ctx.currentTime + 0.12) {
      if (!isMuted()) {
        this.voice(lead, this.step, this.nextTime, stepDur, 'square', 0.035);
        this.voice(bass, this.step, this.nextTime, stepDur, 'triangle', 0.07);
        this.drum(drums[this.step % drums.length], this.nextTime);
      }
      this.nextTime += stepDur;
      this.step = (this.step + 1) % Math.max(lead.length, bass.length);
    }
  }

  private voice(seq: string[], step: number, t: number, stepDur: number, type: OscillatorType, gain: number): void {
    const i = step % seq.length;
    const f = noteFreq(seq[i]);
    if (!f) return;
    let len = 1;
    while (seq[(i + len) % seq.length] === '-' && len < seq.length) len++;
    const ctx = audioContext()!;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.value = f;
    const dur = len * stepDur * 0.92;
    amp.gain.setValueAtTime(gain, t);
    amp.gain.setValueAtTime(gain, t + dur * 0.7);
    amp.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(amp).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.01);
  }

  private drum(kind: string, t: number): void {
    const ctx = audioContext()!;
    if (kind === 'k') {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      amp.gain.setValueAtTime(0.18, t);
      amp.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(amp).connect(this.master!);
      osc.start(t);
      osc.stop(t + 0.15);
      return;
    }
    if (kind !== 's' && kind !== 'h') return;
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = kind === 'h' ? 7000 : 1800;
    const amp = ctx.createGain();
    const dur = kind === 'h' ? 0.04 : 0.12;
    amp.gain.setValueAtTime(kind === 'h' ? 0.03 : 0.08, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(amp).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.01);
  }
}

export const music = new Music();
