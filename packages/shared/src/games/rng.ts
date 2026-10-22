/** Source of uniformly distributed floats in [0, 1). Game rules never call Math.random directly. */
export interface Rng {
  float(): number;
}

/** Uniform integer in [0, n). */
export function randInt(rng: Rng, n: number): number {
  return Math.floor(rng.float() * n);
}

/** Pick an index according to integer weights. */
export function weightedIndex(rng: Rng, weights: readonly number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng.float() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) return i;
  }
  return weights.length - 1;
}

/** Deterministic RNG for tests (mulberry32). Not for production rounds. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    float() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** RNG that replays a fixed list of floats (tests). */
export function sequenceRng(values: readonly number[]): Rng {
  let i = 0;
  return {
    float() {
      if (i >= values.length) throw new Error('sequenceRng exhausted');
      return values[i++]!;
    },
  };
}
