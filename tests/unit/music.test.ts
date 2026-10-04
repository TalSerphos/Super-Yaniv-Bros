import { describe, expect, it } from 'vitest';
import { noteFreq, songsForTest } from '../../src/audio/music.ts';

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

      it('has lead and bass of equal length in whole 4/4 bars', () => {
        expect(lead.length).toBe(bass.length);
        expect(lead.length % 8).toBe(0);
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
  it('World 5 is a fast hora; World 6 has its own music and a one-shot victory with claps', () => {
    const s = songsForTest();
    expect(s.cabin.bpm).toBeGreaterThanOrEqual(176);
    expect(s.cabin.chords).toBeTruthy(); // off-beat stabs
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
