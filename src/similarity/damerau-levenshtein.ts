/**
 * Damerau-Levenshtein distance: the fewest insertions, deletions, substitutions and swaps of
 * two adjacent characters that turn `a` into `b`.
 *
 * This is the unrestricted distance (Lowrance-Wagner), not "optimal string alignment": a
 * substring may be edited more than once, so `CA -> AC -> ABC` costs 2, and the distance
 * satisfies the triangle inequality.
 *
 * Compares Unicode code points exactly as given: normalize first (see `normalizeText`).
 *
 * @example damerauLevenshtein('maria', 'mraia') // 1 (one adjacent swap)
 */
export function damerauLevenshtein(a: string, b: string): number {
  const s1 = Array.from(a);
  const s2 = Array.from(b);
  const n = s1.length;
  const m = s2.length;
  if (n === 0 || m === 0) return n + m;

  // (n + 2) x (m + 2) table; row and column 0 hold a sentinel larger than any distance.
  const width = m + 2;
  const d = new Array<number>((n + 2) * width).fill(0);
  const at = (i: number, j: number): number => d[i * width + j] ?? 0;
  const set = (i: number, j: number, value: number): void => {
    d[i * width + j] = value;
  };
  const infinity = n + m;
  set(0, 0, infinity);
  for (let i = 0; i <= n; i++) {
    set(i + 1, 0, infinity);
    set(i + 1, 1, i);
  }
  for (let j = 0; j <= m; j++) {
    set(0, j + 1, infinity);
    set(1, j + 1, j);
  }

  /** Last row of `a` in which each character was seen. */
  const lastRow = new Map<string, number>();
  for (let i = 1; i <= n; i++) {
    let lastMatchColumn = 0;
    for (let j = 1; j <= m; j++) {
      const i1 = lastRow.get(s2[j - 1] ?? '') ?? 0;
      const j1 = lastMatchColumn;
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      if (cost === 0) lastMatchColumn = j;
      set(
        i + 1,
        j + 1,
        Math.min(
          at(i, j) + cost, // substitution (or match)
          at(i + 1, j) + 1, // insertion
          at(i, j + 1) + 1, // deletion
          at(i1, j1) + (i - i1 - 1) + 1 + (j - j1 - 1), // transposition, with edits between
        ),
      );
    }
    lastRow.set(s1[i - 1] ?? '', i);
  }
  return at(n + 1, m + 1);
}
