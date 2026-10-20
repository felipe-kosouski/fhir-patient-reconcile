import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { damerauLevenshtein, jaroWinkler } from '../../src/index.js';

// Small alphabets make shared characters, repeats and swaps common; the binary strings keep the
// functions honest on arbitrary input (including astral code points).
const word = fc.oneof(
  fc.string({ unit: fc.constantFrom(...'abcde'), maxLength: 8 }),
  fc.string({ unit: 'binary', maxLength: 8 }),
);

// --- reference implementations, written independently of src/ ---

/** Plain Levenshtein (no swaps), textbook two-row dynamic programming. */
function levenshtein(a: string, b: string): number {
  const s = Array.from(a);
  const t = Array.from(b);
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) {
      const sub = (prev[j - 1] ?? 0) + (s[i - 1] === t[j - 1] ? 0 : 1);
      cur.push(Math.min(sub, (prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1));
    }
    prev = cur;
  }
  return prev[t.length] ?? 0;
}

/** Optimal string alignment: Levenshtein plus adjacent swaps, each substring edited once. */
function osa(a: string, b: string): number {
  const s = Array.from(a);
  const t = Array.from(b);
  const d: number[][] = Array.from({ length: s.length + 1 }, (_, i) =>
    Array.from({ length: t.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  const get = (i: number, j: number) => d[i]?.[j] ?? 0;
  for (let i = 1; i <= s.length; i++) {
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      let best = Math.min(get(i - 1, j) + 1, get(i, j - 1) + 1, get(i - 1, j - 1) + cost);
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) {
        best = Math.min(best, get(i - 2, j - 2) + 1);
      }
      (d[i] ?? [])[j] = best;
    }
  }
  return get(s.length, t.length);
}

describe('damerauLevenshtein properties', () => {
  it('is a metric: zero only for equal strings, symmetric, triangle inequality', () => {
    fc.assert(
      fc.property(word, word, word, (a, b, c) => {
        const ab = damerauLevenshtein(a, b);
        expect(ab === 0).toBe(a === b);
        expect(damerauLevenshtein(b, a)).toBe(ab);
        expect(ab).toBeLessThanOrEqual(damerauLevenshtein(a, c) + damerauLevenshtein(c, b));
      }),
    );
  });

  it('sits between the length difference and both reference distances', () => {
    fc.assert(
      fc.property(word, word, (a, b) => {
        const d = damerauLevenshtein(a, b);
        expect(d).toBeGreaterThanOrEqual(Math.abs(Array.from(a).length - Array.from(b).length));
        expect(d).toBeLessThanOrEqual(osa(a, b));
        expect(osa(a, b)).toBeLessThanOrEqual(levenshtein(a, b));
      }),
    );
  });

  it('counts one adjacent swap of different characters as exactly one edit', () => {
    fc.assert(
      fc.property(word, fc.nat(), (s, at) => {
        const chars = Array.from(s);
        if (chars.length < 2) return;
        const i = at % (chars.length - 1);
        if (chars[i] === chars[i + 1]) return;
        const swapped = [...chars];
        [swapped[i], swapped[i + 1]] = [chars[i + 1] ?? '', chars[i] ?? ''];
        expect(damerauLevenshtein(s, swapped.join(''))).toBe(1);
      }),
    );
  });
});

describe('jaroWinkler properties', () => {
  it('stays within [0, 1] and is 1 for identical strings', () => {
    fc.assert(
      fc.property(word, word, (a, b) => {
        const s = jaroWinkler(a, b);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
        expect(jaroWinkler(a, a)).toBe(1);
      }),
    );
  });

  it('is symmetric', () => {
    fc.assert(
      fc.property(word, word, (a, b) => {
        expect(jaroWinkler(a, b)).toBeCloseTo(jaroWinkler(b, a), 12);
      }),
    );
  });

  it('is 0 when the strings share no character', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: fc.constantFrom(...'abc'), minLength: 1 }),
        fc.string({ unit: fc.constantFrom(...'xyz'), minLength: 1 }),
        (a, b) => {
          expect(jaroWinkler(a, b)).toBe(0);
        },
      ),
    );
  });
});
