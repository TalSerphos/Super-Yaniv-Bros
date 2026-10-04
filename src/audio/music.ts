/**
 * A tiny chiptune sequencer: tracks written as note strings, scheduled ahead on the Web Audio
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

// All flight music is our own chiptune arrangement of the traditional (public-domain) Hava Nagila, in D
// freygish (D Eb F# G A Bb C, written with sharps: D# = Eb, A# = Bb). Songs are built from 8-token bars
// (one 4/4 bar of eighth notes) so every voice always has the same length.

/** Part A: "Ha-va na-gi-la, ha-va na-gi-la, ha-va na-gi-la ve-nis-me-cha" (6 bars). */
const PART_A = [
  'D5 - D5 - F#5 - D#5 -',
  'D5 - - - F#5 - F#5 -',
  'A5 - G5 - F#5 - - -',
  'G5 - G5 - A#5 - A5 -',
  'G5 - - - F#5 - D#5 -',
  'F#5 - D5 - - - . .',
];
const CHORDS_A = ['D', 'D', 'D', 'G', 'G', 'D'];

/** Part B: "Ha-va ne-ra-ne-na ... ve-nis-me-cha" (6 bars). */
const PART_B = [
  'A5 - A5 - A5 - G5 F#5',
  'G5 - - - G5 - G5 -',
  'G5 - F#5 D#5 F#5 - - -',
  'F#5 - F#5 - F#5 - D#5 D5',
  'D#5 - - - F#5 - D#5 -',
  'F#5 - D5 - - - . .',
];
const CHORDS_B = ['D', 'G', 'D', 'D', 'C', 'D'];

/** Part C: "U-ru, u-ru a-chim, u-ru a-chim be-lev sa-me-ach" (8 bars), the climbing finale. */
const PART_C = [
  'A5 - A5 - . . A5 A5',
  'A#5 - A5 - G5 - . .',
  'A5 - A5 - A#5 A5 G5 F#5',
  'G5 - F#5 - D#5 - D5 -',
  'D6 - D6 - . . C6 A#5',
  'A5 - G5 - F#5 - - -',
  'G5 G5 A5 A#5 A5 G5 F#5 D#5',
  'D5 - - - . . . .',
];
const CHORDS_C = ['D', 'G', 'D', 'C', 'G', 'D', 'C', 'D'];

/** The 5-4 alarm: a siren fill between phrases. */
const SIREN = ['D6 C#6 D6 C#6 D6 C#6 D6 .', 'A5 G#5 A5 G#5 A5 G#5 A5 .'];
const CHORDS_SIREN = ['D', 'D'];

type Chord = 'D' | 'G' | 'C';
const BASS: Record<'oompah' | 'drive' | 'calm', Record<Chord, string>> = {
  oompah: { D: 'D2 . A2 . D2 . A2 .', G: 'G2 . D3 . G2 . D3 .', C: 'C3 . G2 . C3 . G2 .' },
  drive: { D: 'D2 D2 D3 D2 A2 D2 D3 D2', G: 'G2 G2 G3 G2 D3 G2 G3 G2', C: 'C3 C3 C4 C3 G2 C3 C4 C3' },
  calm: { D: 'D2 - - - A2 - - -', G: 'G2 - - - D3 - - -', C: 'C3 - - - G2 - - -' },
};

/** Shift every note in a bar by whole octaves. */
const octave = (bar: string, by: number) => bar.replace(/([A-G]#?)(\d)/g, (_, n: string, o: string) => `${n}${Number(o) + by}`);

/** Assemble a song from [melody bars, chords] sections, a bass style and a one-bar drum pattern. */
function song(bpm: number, sections: [string[], string[]][], bass: keyof typeof BASS, drumBar: string, shift = 0): Song {
  const lead = sections.flatMap(([bars]) => bars.map((b) => octave(b, shift)));
  const chords = sections.flatMap(([, c]) => c as Chord[]);
  return {
    bpm,
    lead: lead.join('  '),
    bass: chords.map((c) => BASS[bass][c]).join('  '),
    drums: drumBar.repeat(lead.length),
  };
}

const A: [string[], string[]] = [PART_A, CHORDS_A];
const B: [string[], string[]] = [PART_B, CHORDS_B];
const C: [string[], string[]] = [PART_C, CHORDS_C];
const S: [string[], string[]] = [SIREN, CHORDS_SIREN];

/** World 5 cruise: bouncy hora, A A B B. */
const CABIN = song(132, [A, A, B, B], 'oompah', 'k . h h s . h h');
/** 5-4 alarm: faster, driving bass, a siren between phrases. */
const ALARM = song(152, [A, S, A, S], 'drive', 'k h s h k k s h');
/** World 6 boss (6-1, 6-2): the climbing finale first, then the theme, at full tilt. */
const BOSS = song(168, [C, A, C, B], 'drive', 'k h s h k h s s');
/** 6-3, the boss tied up: slow and calm, an octave down. */
const CALM = song(96, [A, B], 'calm', 'k . . . h . . .', -1);

const SONGS = { cabin: CABIN, alarm: ALARM, boss: BOSS, calm: CALM };

/** For tests: every song's voices and drum pattern. */
export const songsForTest = () => SONGS;
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
