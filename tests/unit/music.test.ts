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
      const drums = song.drums.replace(/\s+/g, '').split('');

      it('has lead and bass of equal length in whole 4/4 bars', () => {
        expect(lead.length).toBe(bass.length);
        expect(lead.length % 8).toBe(0);
        expect(drums.length).toBe(lead.length);
      });

      it('uses only notes, holds and rests', () => {
        for (const t of [...lead, ...bass]) expect(t === '-' || t === '.' || noteFreq(t) !== null, t).toBe(true);
        for (const d of drums) expect('ksh.').toContain(d);
      });

      it('never starts a voice on a hold', () => {
        expect(lead[0]).not.toBe('-');
        expect(bass[0]).not.toBe('-');
      });
    });
  }
});
