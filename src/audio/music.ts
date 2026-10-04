/**
 * A tiny chiptune sequencer: tracks written as note strings, scheduled ahead on the Web Audio clock (square
 * lead, triangle bass, soft square chord stabs, noise drums). No audio files, nothing to download.
 *
 * Note strings: one token per eighth note. "A4" = note, "D4+F#4+A4" = chord, "-" = hold the previous
 * note, "." = rest. Drums: "k" kick, "s" snare, "h" hi-hat, "c" hand clap, "." rest.
 * Songs are built from 8-token bars (one 4/4 bar of eighths), so every voice always has the same length.
 */
import { audioContext, isMuted } from './sfx.ts';

interface Song {
  bpm: number;
  lead: string;
  bass: string;
  /** Off-beat chord stabs (optional). */
  chords?: string;
  drums: string;
  /** Lead note length as a fraction of its slot: < 1 gives a bouncy, detached feel. */
  staccato?: number;
}

type Section = [bars: string[], chords: string[]];

/** Shift every note in a bar by whole octaves. */
const octave = (bar: string, by: number) => bar.replace(/([A-G]#?)(\d)/g, (_, n: string, o: string) => `${n}${Number(o) + by}`);

interface Style {
  bass: Record<string, string>;
  /** One bar of chord stabs per chord name (empty: no chord voice). */
  stabs?: Record<string, string>;
  drums: string;
}

/** Assemble a song from sections of [melody bars, chord names], a bass/stab/drum style. */
function song(bpm: number, sections: Section[], style: Style, opts: { shift?: number; staccato?: number } = {}): Song {
  const lead = sections.flatMap(([bars]) => bars.map((b) => octave(b, opts.shift ?? 0)));
  const chords = sections.flatMap(([, c]) => c);
  return {
    bpm,
    lead: lead.join('  '),
    bass: chords.map((c) => style.bass[c]).join('  '),
    chords: style.stabs ? chords.map((c) => style.stabs![c]).join('  ') : undefined,
    drums: style.drums.repeat(lead.length),
    staccato: opts.staccato,
  };
}

// =========================================================================================================
// World 5: our own fast hora arrangement of the traditional (public-domain) Hava Nagila, in D freygish
// (D Eb F# G A Bb C, written with sharps: D# = Eb, A# = Bb).

/** Part A: "Ha-va na-gi-la, ha-va na-gi-la, ha-va na-gi-la ve-nis-me-cha" (6 bars). */
const HAVA_A: Section = [
  ['D5 - D5 - F#5 - D#5 -', 'D5 - - . F#5 - F#5 -', 'A5 - G5 - F#5 - - .', 'G5 - G5 - A#5 - A5 -', 'G5 - - . F#5 - D#5 -', 'F#5 - D5 - D5 F#5 A5 .'],
  ['D', 'D', 'D', 'Gm', 'Gm', 'D'],
];
/** Part B: "Ha-va ne-ra-ne-na ... ve-nis-me-cha" (6 bars). */
const HAVA_B: Section = [
  ['A5 - A5 - A5 - G5 F#5', 'G5 - - . G5 - G5 -', 'G5 - F#5 D#5 F#5 - - .', 'F#5 - F#5 - F#5 - D#5 D5', 'D#5 - - . F#5 - D#5 -', 'F#5 - D5 - D5 F#5 A5 .'],
  ['D', 'Gm', 'D', 'D', 'Cm', 'D'],
];
/** Part C: "U-ru, u-ru a-chim, u-ru a-chim be-lev sa-me-ach" (8 bars), the climbing finale. */
const HAVA_C: Section = [
  [
    'A5 - A5 - . . A5 A5',
    'A#5 - A5 - G5 - . .',
    'A5 - A5 - A#5 A5 G5 F#5',
    'G5 - F#5 - D#5 - D5 -',
    'D6 - D6 - . . C6 A#5',
    'A5 - G5 - F#5 - - .',
    'G5 G5 A5 A#5 A5 G5 F#5 D#5',
    'D5 - D5 - D5 . . .',
  ],
  ['D', 'Gm', 'D', 'Cm', 'Gm', 'D', 'Cm', 'D'],
];
/** The 5-4 alarm: a siren fill between phrases. */
const SIREN: Section = [['D6 C#6 D6 C#6 D6 C#6 D6 .', 'A5 G#5 A5 G#5 A5 G#5 A5 .'], ['D', 'D']];

const HORA: Style = {
  // Oom-pah on the beats, the chord stab on every off-beat: the hora's bounce.
  bass: { D: 'D2 . A2 . D2 . A2 .', Gm: 'G2 . D3 . G2 . D3 .', Cm: 'C3 . G2 . C3 . G2 .' },
  stabs: { D: '. D4+F#4+A4 . D4+F#4+A4 . D4+F#4+A4 . D4+F#4+A4', Gm: '. G3+A#3+D4 . G3+A#3+D4 . G3+A#3+D4 . G3+A#3+D4', Cm: '. C4+D#4+G4 . C4+D#4+G4 . C4+D#4+G4 . C4+D#4+G4' },
  drums: 'k h s h k k s h',
};
const HORA_DRIVE: Style = {
  bass: { D: 'D2 D3 A2 D3 D2 D3 A2 D3', Gm: 'G2 G3 D3 G3 G2 G3 D3 G3', Cm: 'C3 C4 G2 C4 C3 C4 G2 C4' },
  stabs: HORA.stabs,
  drums: 'k h s h k s s h',
};

/** World 5 cruise: a bouncy, quick hora, A A B B C. */
const CABIN = song(184, [HAVA_A, HAVA_A, HAVA_B, HAVA_B, HAVA_C], HORA, { staccato: 0.6 });
/** 5-4 alarm: faster still, a siren between phrases. */
const ALARM = song(208, [HAVA_A, SIREN, HAVA_B, SIREN, HAVA_C], HORA_DRIVE, { staccato: 0.6 });

// =========================================================================================================
// World 6: original music. A driving E-minor boss theme with a bubbly "jacuzzi" arpeggio section, a tense
// quiet theme while he is tied up, and the victory fanfare with hand-claps.

const BOSS_RIFF: Section = [
  ['E5 . E5 . G5 . E5 .', 'D5 . E5 . B4 - - .', 'E5 . E5 . G5 . A5 .', 'A#5 - A5 - G5 - . .', 'B5 . A5 . G5 . F#5 .', 'G5 . F#5 . E5 . D5 .', 'E5 . G5 . B5 . E6 .', 'D#6 - - - B5 - . .'],
  ['Em', 'Em', 'Em', 'C', 'Em', 'Am', 'Em', 'B'],
];
const BOSS_BUBBLES: Section = [
  ['E5 G5 B5 G5 E5 G5 B5 G5', 'C5 E5 G5 E5 C5 E5 G5 E5', 'A4 C5 E5 C5 A4 C5 E5 C5', 'B4 D#5 F#5 D#5 B4 D#5 F#5 D#5'],
  ['Em', 'C', 'Am', 'B'],
];
const VILLAIN: Style = {
  bass: { Em: 'E2 E2 E3 E2 B2 E2 E3 E2', C: 'C2 C2 C3 C2 G2 C2 C3 C2', Am: 'A2 A2 A3 A2 E2 A2 A3 A2', B: 'B1 B1 B2 B1 F#2 B1 B2 B1' },
  drums: 'k h s h k h s s',
};
const BOSS = song(160, [BOSS_RIFF, BOSS_BUBBLES, BOSS_RIFF, BOSS_BUBBLES], VILLAIN, { staccato: 0.75 });

const TIED_UP: Section = [
  ['A4 - - - C5 - B4 -', 'A4 - E4 - - - . .', 'F4 - - - A4 - G4 -', 'E4 - - - - - . .', 'D4 - F4 - A4 - G4 -', 'F4 - E4 - D4 - . .', 'E4 - G#4 - B4 - D5 -', 'C5 - B4 - A4 - - .'],
  ['Am', 'Am', 'F', 'E', 'Dm', 'Dm', 'E', 'Am'],
];
const HUSH: Style = {
  bass: { Am: 'A2 - - - E2 - - -', F: 'F2 - - - C3 - - -', E: 'E2 - - - B2 - - -', Dm: 'D2 - - - A2 - - -' },
  drums: 'k . . . h . h .',
};
const CALM = song(108, [TIED_UP, TIED_UP], HUSH);

/** The 6-3 win (plays once): a bright original fanfare over hand-claps in the chant's rhythm. */
const VICTORY_BARS: Section = [
  ['D5 . D5 . D5 . F#5 -', 'A5 - - . F#5 . A5 .', 'D6 - - - - - . .', 'B5 . A5 . G5 . F#5 .', 'E5 . F#5 . G5 . A5 .', 'D6 - - - - - - .', '. . . . . . . .', '. . . . . . . .'],
  ['D', 'D', 'D', 'G', 'A', 'D', 'D', 'D'],
];
const CHEER: Style = {
  bass: { D: 'D2 . A2 . D2 . A2 .', G: 'G2 . D3 . G2 . D3 .', A: 'A2 . E3 . A2 . E3 .' },
  stabs: { D: '. D4+F#4+A4 . D4+F#4+A4 . D4+F#4+A4 . D4+F#4+A4', G: '. G3+B3+D4 . G3+B3+D4 . G3+B3+D4 . G3+B3+D4', A: '. A3+C#4+E4 . A3+C#4+E4 . A3+C#4+E4 . A3+C#4+E4' },
  // "Am Yis-ra-el Chai!": clap clap clap-clap-clap.
  drums: 'c . c . c c c .',
};
const VICTORY = song(150, [VICTORY_BARS], CHEER, { staccato: 0.7 });

// =========================================================================================================
// World 7, Washington: an original bright march (F major) and a stately version for the Oval Office.

const MARCH_A: Section = [
  ['F5 . F5 . A5 . C6 .', 'A5 - F5 - C5 - - .', 'D5 . E5 . F5 . G5 .', 'A5 - G5 - F5 - - .', 'A#5 . A#5 . D6 . A#5 .', 'A5 . A5 . C6 . A5 .', 'G5 . F5 . E5 . G5 .', 'F5 - - - C5 - - .'],
  ['F', 'F', 'Bb', 'F', 'Bb', 'F', 'C', 'F'],
];
const MARCH_TRIO: Section = [
  ['C5 - F5 - A5 - C6 -', 'A#5 - A5 - G5 - - .', 'A#4 - D5 - F5 - A#5 -', 'A5 - G5 - F5 - - .', 'C5 - E5 - G5 - C6 -', 'A#5 - A5 - G5 - E5 -', 'F5 . A5 . G5 . E5 .', 'F5 - - - - - . .'],
  ['F', 'C', 'Bb', 'F', 'C', 'C', 'C', 'F'],
];
const PARADE: Style = {
  bass: { F: 'F2 . C3 . F2 . C3 .', Bb: 'A#1 . F2 . A#1 . F2 .', C: 'C2 . G2 . C2 . G2 .' },
  stabs: { F: '. F4+A4+C5 . F4+A4+C5 . F4+A4+C5 . F4+A4+C5', Bb: '. F4+A#4+D5 . F4+A#4+D5 . F4+A#4+D5 . F4+A#4+D5', C: '. E4+G4+C5 . E4+G4+C5 . E4+G4+C5 . E4+G4+C5' },
  drums: 'k h s h k s s s',
};
const STATELY: Style = {
  bass: { F: 'F2 - - - C3 - - -', Bb: 'A#1 - - - F2 - - -', C: 'C2 - - - G2 - - -' },
  stabs: PARADE.stabs,
  drums: 'k . . . s . . .',
};
const MARCH = song(132, [MARCH_A, MARCH_A, MARCH_TRIO], PARADE, { staccato: 0.7 });
const CEREMONY = song(92, [MARCH_TRIO], STATELY);

// =========================================================================================================
// World 3, DXB Airport: an original, breezy "terminal lounge" tune in C major, opened by a three-note PA
// chime, with a rolling "travelator" section; 3-4 Gate Closing plays a faster, driving last-call version.

const PA_CHIME: Section = [['G5 - E5 - C5 - - .', '. . . . . . . .'], ['C', 'C']];
const TERMINAL_A: Section = [
  ['E5 . G5 . A5 G5 E5 .', 'D5 - E5 - C5 - . .', 'E5 . G5 . A5 G5 C6 .', 'B5 - A5 - G5 - . .', 'A5 . A5 . G5 E5 G5 .', 'E5 - D5 - C5 - A4 .', 'D5 . E5 . F5 . A5 .', 'G5 - - - . . . .'],
  ['C', 'Am', 'F', 'G', 'F', 'Am', 'Dm', 'G'],
];
const TRAVELATOR: Section = [
  ['C5 E5 G5 C6 B5 G5 E5 G5', 'A4 C5 E5 A5 G5 E5 C5 E5', 'F4 A4 C5 F5 E5 C5 A4 C5', 'G4 B4 D5 G5 F5 D5 B4 D5', 'E5 - E5 . F5 - F5 .', 'G5 - G5 . A5 - G5 .', 'F5 . E5 . D5 . B4 .', 'C5 - - - . . . .'],
  ['C', 'Am', 'F', 'G', 'Am', 'F', 'G', 'C'],
];
const STABS_C = {
  C: '. C4+E4+G4 . . C4+E4+G4 . C4+E4+G4 .',
  Am: '. A3+C4+E4 . . A3+C4+E4 . A3+C4+E4 .',
  F: '. F3+A3+C4 . . F3+A3+C4 . F3+A3+C4 .',
  G: '. G3+B3+D4 . . G3+B3+D4 . G3+B3+D4 .',
  Dm: '. D4+F4+A4 . . D4+F4+A4 . D4+F4+A4 .',
};
const LOUNGE: Style = {
  // A light, syncopated bossa-ish bass and off-beat stabs: rolling-suitcase energy.
  bass: { C: 'C2 . . G2 C3 . G2 .', Am: 'A1 . . E2 A2 . E2 .', F: 'F1 . . C2 F2 . C2 .', G: 'G1 . . D2 G2 . D2 .', Dm: 'D2 . . A2 D3 . A2 .' },
  stabs: STABS_C,
  drums: 'k . h s . k s h',
};
const LAST_CALL: Style = {
  bass: { C: 'C2 C3 C2 C3 G2 C3 C2 C3', Am: 'A1 A2 A1 A2 E2 A2 A1 A2', F: 'F1 F2 F1 F2 C2 F2 F1 F2', G: 'G1 G2 G1 G2 D2 G2 G1 G2', Dm: 'D2 D3 D2 D3 A2 D3 D2 D3' },
  stabs: STABS_C,
  drums: 'k h s h k k s h',
};
const TERMINAL = song(144, [PA_CHIME, TERMINAL_A, TERMINAL_A, TRAVELATOR], LOUNGE, { staccato: 0.7 });
const LASTCALL = song(176, [PA_CHIME, TERMINAL_A, TRAVELATOR, TRAVELATOR], LAST_CALL, { staccato: 0.65 });

const SONGS = {
  cabin: CABIN,
  alarm: ALARM,
  boss: BOSS,
  calm: CALM,
  victory: VICTORY,
  march: MARCH,
  ceremony: CEREMONY,
  terminal: TERMINAL,
  lastcall: LASTCALL,
};
export type SongName = keyof typeof SONGS;

/** For tests: every song's voices and drum pattern. */
export const songsForTest = () => SONGS;

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
  private once = false;
  private onEnd?: () => void;
  private step = 0;
  private nextTime = 0;
  private timer = 0;
  private noise: AudioBuffer | null = null;
  private master: GainNode | null = null;

  /** Loop a song; `once` plays it a single time, then calls `onEnd`. */
  play(name: SongName, once = false, onEnd?: () => void): void {
    this.stop();
    this.song = SONGS[name];
    this.once = once;
    this.onEnd = onEnd;
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
    const chords = song.chords ? tokens(song.chords) : null;
    const drums = song.drums.replace(/\s+/g, '').split('');
    const length = Math.max(lead.length, bass.length);
    // Schedule everything due in the next 120 ms.
    while (this.nextTime < ctx.currentTime + 0.12) {
      if (this.once && this.step >= length) {
        const done = this.onEnd;
        this.stop();
        done?.();
        return;
      }
      if (!isMuted()) {
        this.voice(lead, this.step, this.nextTime, stepDur, 'square', 0.035, song.staccato ?? 0.92);
        this.voice(bass, this.step, this.nextTime, stepDur, 'triangle', 0.07, 0.92);
        if (chords) this.voice(chords, this.step, this.nextTime, stepDur, 'square', 0.012, 0.5);
        this.drum(drums[this.step % drums.length], this.nextTime);
      }
      this.nextTime += stepDur;
      this.step = this.once ? this.step + 1 : (this.step + 1) % length;
    }
  }

  private voice(seq: string[], step: number, t: number, stepDur: number, type: OscillatorType, gain: number, fill: number): void {
    const i = step % seq.length;
    const notes = seq[i].split('+').map(noteFreq).filter((f): f is number => f !== null);
    if (!notes.length) return;
    let len = 1;
    while (seq[(i + len) % seq.length] === '-' && len < seq.length) len++;
    const ctx = audioContext()!;
    // A held note keeps ringing for its whole length; a single slot uses the voice's fill (staccato).
    const dur = (len > 1 ? len * 0.92 : fill) * stepDur;
    for (const f of notes) {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type;
      osc.frequency.value = f;
      amp.gain.setValueAtTime(gain, t);
      amp.gain.setValueAtTime(gain, t + dur * 0.7);
      amp.gain.linearRampToValueAtTime(0, t + dur);
      osc.connect(amp).connect(this.master!);
      osc.start(t);
      osc.stop(t + dur + 0.01);
    }
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
    if (kind === 'c') {
      // A hand-clap: a few people clapping a hair apart (three band-passed noise bursts).
      for (const [dt, g] of [
        [0, 0.09],
        [0.012, 0.07],
        [0.027, 0.06],
      ] as const) {
        this.noiseBurst(t + dt, 1400, 'bandpass', g, 0.09);
      }
      return;
    }
    if (kind === 's') this.noiseBurst(t, 1800, 'highpass', 0.08, 0.12);
    if (kind === 'h') this.noiseBurst(t, 7000, 'highpass', 0.03, 0.04);
  }

  private noiseBurst(t: number, freq: number, type: BiquadFilterType, gain: number, dur: number): void {
    const ctx = audioContext()!;
    if (!this.noise) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(amp).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.01);
  }
}

export const music = new Music();
