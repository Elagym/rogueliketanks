import seedrandom from 'seedrandom';

/** Deterministic RNG wrapper around seedrandom for seeded map generation. */
export class Rng {
  private fn: seedrandom.PRNG;

  constructor(seed: number | string) {
    this.fn = seedrandom(String(seed));
  }

  /** [0, 1) */
  next(): number {
    return this.fn();
  }

  /** [min, max) */
  range(min: number, max: number): number {
    return min + this.fn() * (max - min);
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  bool(p = 0.5): boolean {
    return this.fn() < p;
  }

  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.fn() * arr.length)];
  }
}

export function randomSeed(): number {
  return Date.now() % 1_000_000;
}
