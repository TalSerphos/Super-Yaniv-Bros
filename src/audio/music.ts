/**
 * A tiny chiptune sequencer: tracks written as note strings, scheduled ahead on the Web Audio clock (square
 * lead, triangle bass, soft square chord stabs, noise drums). No audio files, nothing to download.
 *
 * Note strings: one token per eighth note. "A4" = note, "D4+F#4+A4" = chord, "-" = hold the previous
 * note, "." = rest. Drums: "k" kick, "s" snare, "h" hi-hat, "c" hand clap, "." rest.
 * Songs are built from 8-token bars (one 4/4 bar of eighths), or 16-token bars when a song is written in
 * sixteenths (`sub: 4`), so every voice always has the same length.
 */
import { audioContext, isMuted } from './sfx.ts';

interface Song {
  /** Tempo of the first bar (see `tempo` for the whole map). */
  bpm: number;
  /** Tempo of every 8-step bar (bpm): sections can ramp, e.g. the hora's accelerando. */
  tempo: number[];
  /** Also play the lead an octave lower (a sung melody's body: the tune carries over the band). */
  double?: boolean;
  /** Steps per beat: 2 = eighth notes (default), 4 = sixteenths (bars are then 16 tokens). */
  sub?: number;
  lead: string;
  bass: string;
  /** Off-beat chord stabs (optional). */
  chords?: string;
  drums: string;
  /** Lead note length as a fraction of its slot: < 1 gives a bouncy, detached feel. */
  staccato?: number;
}

/** Per-section options: a tempo ramp over its bars, and its own drum pattern (e.g. hand-claps). */
interface SectionOpts {
  bpm?: [from: number, to: number];
  drums?: string;
}
type Section = [bars: string[], chords: string[], opts?: SectionOpts];

/** Shift every note in a bar by whole octaves. */
const octave = (bar: string, by: number) => bar.replace(/([A-G]#?)(\d)/g, (_, n: string, o: string) => `${n}${Number(o) + by}`);

interface Style {
  bass: Record<string, string>;
  /** One bar of chord stabs per chord name (empty: no chord voice). */
  stabs?: Record<string, string>;
  drums: string;
}

/** Assemble a song from sections of [melody bars, chord names, options], a bass/stab/drum style. */
function song(bpm: number, sections: Section[], style: Style, opts: { shift?: number; staccato?: number; double?: boolean; sub?: number } = {}): Song {
  const lead = sections.flatMap(([bars]) => bars.map((b) => octave(b, opts.shift ?? 0)));
  const chords = sections.flatMap(([, c]) => c);
  const tempo = sections.flatMap(([bars, , o]) => {
    const [from, to] = o?.bpm ?? [bpm, bpm];
    return bars.map((_, i) => Math.round(from + ((to - from) * i) / Math.max(1, bars.length - 1)));
  });
  return {
    bpm: tempo[0],
    tempo,
    double: opts.double,
    sub: opts.sub,
    lead: lead.join('  '),
    bass: chords.map((c) => style.bass[c]).join('  '),
    chords: style.stabs ? chords.map((c) => style.stabs![c]).join('  ') : undefined,
    drums: sections.flatMap(([bars, , o]) => bars.map(() => o?.drums ?? style.drums)).join(' '),
    staccato: opts.staccato,
  };
}

// =========================================================================================================
// World 5: Hava Nagila, the traditional melody (A. Z. Idelsohn, public domain), transcribed bar by bar from a
// piano score Tal supplied (in E freygish), moved down to D freygish (D Eb F# G A Bb C, written with sharps:
// D# = Eb, A# = Bb) and up an octave for the lead. Written in sixteenths (16 tokens a bar) for the dotted and
// grace-note rhythms. Played the way it is danced: the klezmer run, "Hava nagila" twice, "Hava neranena" twice,
// "Uru achim" with hand-claps, faster and faster, "Hava nagila" again at full speed, then round again.

/** Bars 1-4: the klezmer intro run, and a bar of band alone (accelerando into the song). */
const HAVA_INTRO: Section = [
  [
    'D5 D#5 F#5 G5 A5 G5 F#5 D#5 D5 - F#5 D#5 D5 - D5 -',
    'F#5 G5 A5 A#5 C6 A#5 A5 G5 F#5 - A5 G5 F#5 - F#5 -',
    'F#5 D#5 D5 - D5 - D5 C5 A4 - A4 - . . . .',
    '. . . . . . . . . . . . . . . .',
  ],
  ['D', 'D', 'D', 'D'],
];
/** Bars 5-8: "Ha-va na-gi-la" three times, each line higher (D, F#, G), and "ve-nis-me-cha". */
const HAVA_A: Section = [
  [
    'D5 - - - D5 - - - - - F#5 - D#5 - D5 -',
    'F#5 - - - F#5 - - - - - A5 - G5 - F#5 -',
    'G5 - - - G5 - - - - - A#5 - A5 - G5 -',
    'F#5 - - - D#5 D5 D#5 - F#5 - - - - - - -',
  ],
  ['D', 'D', 'Gm', 'D'],
];
/** Bars 9-12: "Ha-va ne-ra-ne-na", stepping down, and "ve-nis-me-cha". */
const HAVA_B: Section = [
  [
    'F#5 F#5 - - D#5 - - - D5 - D5 - D5 - - -',
    'D#5 D#5 - - D5 - - - C5 - C5 - C5 - - -',
    'C5 - - - D#5 - - D5 C5 - - - G5 - - -',
    'F#5 - - - D#5 D5 D#5 - F#5 - - - - - - -',
  ],
  ['D', 'Cm', 'Cm', 'D'],
];
/** Bars 14-23: "U-ru, u-ru a-chim, u-ru a-chim be-lev sa-me-ach", the shouts, and the run home. */
const HAVA_C: Section = [
  [
    'G5 - - - - - - - G5 - - - - - - -',
    'G5 - - - G5 - - - G5 - - - G5 - - -',
    'G5 - - - A#5 - - A5 - - A#5 - A5 - G5 -',
    'G5 - - - A#5 - - A5 - - A#5 - A5 - G5 -',
    'A5 - - - C6 - - A#5 - - C6 - A#5 - A5 -',
    'A5 - - - C6 - - A#5 - - C6 - A#5 - A5 -',
    'A5 - A5 - D6 - - - . . . . . . . .',
    'A5 - A5 - D6 - - - . . . . . . . .',
    'D5 - D5 - D5 - D5 - A#5 - A5 - G5 - F#5 -',
    'D5 - - - - - - - - - - - - - - -',
  ],
  ['Gm', 'Gm', 'Gm', 'Gm', 'F', 'F', 'D', 'D', 'Gm', 'D'],
];
/** Coda: the held D and the band's closing button. */
const HAVA_CODA: Section = [['D5 - - - - - - - - - - - - - - -', 'D5 - - - . . . . A4 - . . D5 - . .'], ['D', 'D']];
/** The 5-4 alarm: a siren fill between phrases. */
const SIREN: Section = [['D6 - C#6 - D6 - C#6 - D6 - C#6 - D6 - . .', 'A5 - G#5 - A5 - G#5 - A5 - G#5 - A5 - . .'], ['D', 'D']];

/** A section with its own tempo ramp and drums. */
const at = ([bars, chords]: Section, from: number, to: number, drums?: string): Section => [bars, chords, { bpm: [from, to], drums }];
/** Drum feels (sixteenths): brushed for the singing, the hora beat, hand-claps for "Uru achim", the button. */
const SOFT = 'k . . . h . . . k . . . h . . .';
const CLAPS = 'k . h . c . h . k . h . c . h .';
const BUTTON = 'k . . . . . . . k . . . k . . .';

// The score's left hand: oom-pah eighths on the root and fifth, chords on the off-beats.
const pump = (root: string, fifth: string) => `${root} . ${fifth} . ${root} . ${fifth} . ${root} . ${fifth} . ${root} . ${fifth} .`;
const offbeat = (chord: string) => `. . ${chord} . . . ${chord} . . . ${chord} . . . ${chord} .`;
const HORA: Style = {
  bass: { D: pump('D2', 'A2'), Gm: pump('G2', 'D3'), Cm: pump('C3', 'G2'), F: pump('F2', 'C3') },
  stabs: { D: offbeat('D4+F#4+A4'), Gm: offbeat('G3+A#3+D4'), Cm: offbeat('C4+D#4+G4'), F: offbeat('F3+A3+C4') },
  drums: 'k . h . s . h . k . h . s . h .',
};
const drive = (root: string, fifth: string, up: string) => `${root} . ${up} . ${fifth} . ${up} . ${root} . ${up} . ${fifth} . ${up} .`;
const HORA_DRIVE: Style = {
  bass: { D: drive('D2', 'A2', 'D3'), Gm: drive('G2', 'D3', 'G3'), Cm: drive('C3', 'G2', 'C4'), F: drive('F2', 'C3', 'F3') },
  stabs: HORA.stabs,
  drums: 'k . h . s . h . k . s . s . h .',
};

/** World 5 cruise: the score's own 140 bpm, racing to 184 in "Uru achim", "Hava nagila" again at speed. */
const CABIN = song(
  140,
  [
    at(HAVA_INTRO, 132, 144, SOFT),
    at(HAVA_A, 140, 140, SOFT),
    at(HAVA_A, 140, 142, SOFT),
    at(HAVA_B, 144, 150),
    at(HAVA_B, 150, 156),
    at(HAVA_C, 160, 184, CLAPS),
    at(HAVA_A, 184, 184),
    at(HAVA_A, 184, 184, CLAPS),
    at(HAVA_CODA, 184, 184, BUTTON),
  ],
  HORA,
  { staccato: 0.9, double: true, sub: 4 },
);
/** 5-4 alarm: the same dance, already fast and racing to 208, with a siren between the parts. */
const ALARM = song(
  168,
  [
    at(HAVA_A, 168, 172),
    at(SIREN, 174, 174),
    at(HAVA_B, 176, 184),
    at(SIREN, 186, 186),
    at(HAVA_C, 188, 208, CLAPS),
    at(HAVA_A, 208, 208, CLAPS),
    at(HAVA_CODA, 208, 208, BUTTON),
  ],
  HORA_DRIVE,
  { staccato: 0.9, double: true, sub: 4 },
);

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

interface Tracks {
  lead: string[];
  bass: string[];
  chords: string[] | null;
  drums: string[];
  length: number;
}

function tracksOf(song: Song): Tracks {
  const lead = tokens(song.lead);
  const bass = tokens(song.bass);
  return {
    lead,
    bass,
    chords: song.chords ? tokens(song.chords) : null,
    drums: song.drums.replace(/\s+/g, '').split(''),
    length: Math.max(lead.length, bass.length),
  };
}

/** Length of one step (s) at this point of the song: its bar's tempo, eighths or sixteenths. */
export function stepSeconds(song: Song, step: number): number {
  const sub = song.sub ?? 2;
  return 60 / song.tempo[Math.floor(step / (4 * sub)) % song.tempo.length] / sub;
}

/** The synth voices, playing song steps onto any audio context (the live one, or an offline render). */
class Band {
  private noise: AudioBuffer | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly out: AudioNode,
  ) {}

  /** Schedule one step of every voice at time t. */
  play(song: Song, tr: Tracks, step: number, t: number): void {
    const stepDur = stepSeconds(song, step);
    this.voice(tr.lead, step, t, stepDur, 'square', 0.035, song.staccato ?? 0.92);
    // The tune's body an octave down, softer: it carries over the stabs like a sung melody.
    if (song.double) this.voice(tr.lead, step, t, stepDur, 'triangle', 0.05, song.staccato ?? 0.92, 0.5);
    this.voice(tr.bass, step, t, stepDur, 'triangle', 0.07, 0.92);
    if (tr.chords) this.voice(tr.chords, step, t, stepDur, 'square', 0.012, 0.5);
    this.drum(tr.drums[step % tr.drums.length], t);
  }

  private voice(seq: string[], step: number, t: number, stepDur: number, type: OscillatorType, gain: number, fill: number, pitch = 1): void {
    const i = step % seq.length;
    const notes = seq[i].split('+').map(noteFreq).filter((f): f is number => f !== null);
    if (!notes.length) return;
    let len = 1;
    while (seq[(i + len) % seq.length] === '-' && len < seq.length) len++;
    const ctx = this.ctx;
    // A held note keeps ringing for its whole length; a single slot uses the voice's fill (staccato).
    const dur = (len > 1 ? len * 0.92 : fill) * stepDur;
    for (const f of notes) {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type;
      osc.frequency.value = f * pitch;
      amp.gain.setValueAtTime(gain, t);
      amp.gain.setValueAtTime(gain, t + dur * 0.7);
      amp.gain.linearRampToValueAtTime(0, t + dur);
      osc.connect(amp).connect(this.out);
      osc.start(t);
      osc.stop(t + dur + 0.01);
    }
  }

  private drum(kind: string, t: number): void {
    const ctx = this.ctx;
    if (kind === 'k') {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      amp.gain.setValueAtTime(0.18, t);
      amp.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(amp).connect(this.out);
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
    const ctx = this.ctx;
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
    src.connect(filter).connect(amp).connect(this.out);
    src.start(t);
    src.stop(t + dur + 0.01);
  }
}

/** Render a song offline (previews, tests): `seconds` of audio, or one full pass if omitted. */
export async function renderSong(name: SongName, seconds?: number, sampleRate = 44100): Promise<AudioBuffer> {
  const song = SONGS[name];
  const tr = tracksOf(song);
  let full = 0;
  for (let i = 0; i < tr.length; i++) full += stepSeconds(song, i);
  const total = seconds ?? full + 0.5;
  const ctx = new OfflineAudioContext(1, Math.ceil(total * sampleRate), sampleRate);
  const master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);
  const band = new Band(ctx, master);
  for (let step = 0, t = 0.05; t < total - 0.05; step++) {
    band.play(song, tr, step % tr.length, t);
    t += stepSeconds(song, step % tr.length);
  }
  return ctx.startRendering();
}

class Music {
  private song: Song | null = null;
  private tracks: Tracks | null = null;
  private once = false;
  private onEnd?: () => void;
  private step = 0;
  private nextTime = 0;
  private timer = 0;
  private band: Band | null = null;
  private master: GainNode | null = null;

  /** Loop a song; `once` plays it a single time, then calls `onEnd`. */
  play(name: SongName, once = false, onEnd?: () => void): void {
    this.stop();
    this.song = SONGS[name];
    this.tracks = tracksOf(this.song);
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
    this.band = null;
  }

  private schedule(): void {
    const ctx = audioContext();
    const song = this.song;
    const tr = this.tracks;
    if (!ctx || !song || !tr) return;
    if (!this.master) {
      this.master = ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(ctx.destination);
      this.band = new Band(ctx, this.master);
    }
    // Schedule everything due in the next 120 ms (each step lasts as long as its bar's tempo says).
    while (this.nextTime < ctx.currentTime + 0.12) {
      if (this.once && this.step >= tr.length) {
        const done = this.onEnd;
        this.stop();
        done?.();
        return;
      }
      if (!isMuted()) this.band!.play(song, tr, this.step, this.nextTime);
      this.nextTime += stepSeconds(song, this.step);
      this.step = this.once ? this.step + 1 : (this.step + 1) % tr.length;
    }
  }
}

export const music = new Music();
