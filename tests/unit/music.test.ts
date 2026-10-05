import { describe, expect, it } from 'vitest';
import { noteFreq, songsForTest, stepSeconds } from '../../src/audio/music.ts';

const tokens = (s: string) => s.trim().split(/\s+/);

describe('music', () => {
  it('maps A4 to 440 Hz and D5 to about 587 Hz', () => {
    expect(noteFreq('A4')).toBeCloseTo(440);
    expect(noteFreq('D5')).toBeCloseTo(587.33, 1);
    expect(noteFreq('-')).toBeNull();
  });

  for (const [name, song] of Object.entries(songsForTest())) {
    describe(name, () => {
      const lead = tokens(song.lead);
      const bass = tokens(song.bass);
      const chords = song.chords ? tokens(song.chords) : null;
      const drums = song.drums.replace(/\s+/g, '').split('');

      const barLen = 4 * (song.sub ?? 2);
      it('has lead and bass of equal length in whole 4/4 bars, and a tempo for every bar', () => {
        expect(lead.length).toBe(bass.length);
        expect(lead.length % barLen).toBe(0);
        expect(song.tempo.length).toBe(lead.length / barLen);
        expect(drums.length).toBe(lead.length);
        if (chords) expect(chords.length).toBe(lead.length);
      });

      it('uses only notes, holds and rests', () => {
        const ok = (t: string) => t === '-' || t === '.' || t.split('+').every((n) => noteFreq(n) !== null);
        for (const t of [...lead, ...bass, ...(chords ?? [])]) expect(ok(t), t).toBe(true);
        for (const d of drums) expect('kshc.').toContain(d);
      });

      it('never starts a voice on a hold', () => {
        expect(lead[0]).not.toBe('-');
        expect(bass[0]).not.toBe('-');
      });
    });
  }
});

describe('music by world', () => {
  it('World 6 has its own music and a one-shot victory with claps', () => {
    const s = songsForTest();
    expect(s.boss.lead).not.toBe(s.cabin.lead);
    expect(s.victory.drums).toContain('c');
  });

  it('World 3 has its own airport tune, opened by the PA chime, and a faster last call for 3-4', () => {
    const s = songsForTest();
    expect(s.terminal.lead.startsWith('G5 - E5 - C5')).toBe(true);
    expect(s.lastcall.bpm).toBeGreaterThan(s.terminal.bpm);
    expect(s.terminal.lead).not.toBe(s.march.lead);
  });
});

describe('World 5: Hava Nagila', () => {
  const s = songsForTest();
  const bars = (song: { lead: string; sub?: number }) => {
    const t = tokens(song.lead);
    const n = 4 * (song.sub ?? 2);
    return Array.from({ length: t.length / n }, (_, i) => t.slice(i * n, (i + 1) * n));
  };
  const firstNote = (bar: string[]) => bar.find((t) => t !== '-' && t !== '.');

  it('sings the three "Ha-va na-gi-la" lines on D, F# and G, then "ve-nis-me-cha" ends open on F#', () => {
    const b = bars(s.cabin);
    const a = b.findIndex((bar) => bar.join(' ').startsWith('D5 - - - D5')); // after the klezmer intro
    expect(a).toBeGreaterThan(0);
    expect(b.slice(a, a + 4).map(firstNote)).toEqual(['D5', 'F#5', 'G5', 'F#5']);
    // Each line: "Ha" (a beat), "va" (held a beat and a half), "na-gi-la" a third up and back down by step.
    expect(b[a].join(' ')).toBe('D5 - - - D5 - - - - - F#5 - D#5 - D5 -');
  });

  it('starts at the score tempo (140), races to 184 in "Uru achim", and never slows down within a pass', () => {
    const t = s.cabin.tempo;
    expect(s.cabin.bpm).toBeLessThanOrEqual(144);
    expect(Math.max(...t)).toBeGreaterThanOrEqual(184);
    expect(t.slice(4).every((v, i, all) => i === 0 || v >= all[i - 1])).toBe(true);
  });

  it('claps in "Uru achim", doubles the tune an octave down, and the 5-4 alarm is faster all the way', () => {
    expect(s.cabin.drums).toContain('c');
    expect(s.cabin.double).toBe(true);
    expect(Math.min(...s.alarm.tempo)).toBeGreaterThan(s.cabin.tempo[4]);
    expect(Math.max(...s.alarm.tempo)).toBeGreaterThan(Math.max(...s.cabin.tempo));
  });

  it('a sixteenth at 140 bpm lasts about 107 ms, an eighth of the other songs keeps its old length', () => {
    expect(stepSeconds(s.cabin, 4 * 16)).toBeCloseTo(60 / 140 / 4, 5);
    expect(stepSeconds(s.boss, 0)).toBeCloseTo(60 / 160 / 2, 5);
  });
});
