/**
 * Sample documents need values that look arbitrary, but `Math.random` cannot
 * be tested and would churn the output on every run. A seeded generator gives
 * both: the numbers look scattered, and the same model always produces exactly
 * the same documents, so the exporter can be pinned with a golden file.
 *
 * Xorshift32 is nine lines and worth writing rather than importing. It is a
 * shift-register generator: three shift-and-xor steps stir the bits of a
 * 32 bit state well enough for anything that is not cryptography.
 *
 *     x ^= x << 13;  x ^= x >>> 17;  x ^= x << 5;
 *
 * The `>>> 0` after each step is not decoration. JavaScript bitwise operators
 * produce signed 32 bit results, and without forcing the value back to
 * unsigned the state drifts negative and the sequence changes.
 */

export interface Random {
  /** The next raw 32 bit value. */
  next(): number;
  /** A whole number in `[0, bound)`. */
  int(bound: number): number;
  /** A fraction in `[0, 1)`. */
  fraction(): number;
  pick<T>(values: readonly T[]): T;
}

export function createRandom(seed: number): Random {
  // A zero state is a fixed point of xorshift, so it has to be replaced.
  let state = seed >>> 0 || 0x9e3779b9;

  const next = (): number => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };

  return {
    next,
    int: (bound) => (bound <= 0 ? 0 : next() % bound),
    fraction: () => next() / 0x1_0000_0000,
    pick: (values) => values[next() % values.length]!,
  };
}

/**
 * FNV-1a, used to turn a field path into a seed.
 *
 * Seeding from the path rather than from a running counter means a field's
 * sample value depends only on where it sits in the model, so adding a field
 * at the top does not change every value below it.
 */
export function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function randomFor(path: string): Random {
  return createRandom(hash(path));
}
