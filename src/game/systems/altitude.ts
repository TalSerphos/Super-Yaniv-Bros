/** Altitude is the level timer in flight worlds: it counts down and the run ends at 0 ft. */
export class Altitude {
  private feet: number;

  constructor(
    readonly start: number,
    /** Feet lost per second. */
    readonly rate: number,
  ) {
    this.feet = start;
  }

  get value(): number {
    return this.feet;
  }

  get crashed(): boolean {
    return this.feet <= 0;
  }

  tick(dtSeconds: number): number {
    this.feet = Math.max(0, this.feet - this.rate * dtSeconds);
    return this.feet;
  }

  /** HUD text, e.g. "24,300 FT" (rounded down to the nearest 10 ft, like a real altimeter readout). */
  format(): string {
    return `${(Math.floor(this.feet / 10) * 10).toLocaleString('en-US')} FT`;
  }
}
