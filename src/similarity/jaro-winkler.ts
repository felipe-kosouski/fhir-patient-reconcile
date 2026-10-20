/** Winkler's prefix scale: how much each shared leading character raises the score. */
const PREFIX_SCALE = 0.1;
/** Only the first four characters can earn the prefix bonus. */
const MAX_PREFIX = 4;
/** The prefix bonus applies only to pairs that are already similar (Jaro above this). */
const BOOST_THRESHOLD = 0.7;

/**
 * Jaro-Winkler similarity, from 0 (nothing in common) to 1 (identical).
 *
 * Follows Winkler's reference implementation (`strcmp95.c`, U.S. Census Bureau): characters
 * match when equal and at most `floor(max(|a|, |b|) / 2) - 1` positions apart; half the matched
 * characters that are out of order, rounded down, count as transpositions; when the Jaro score
 * is above 0.7 it gets a bonus of `0.1 x (1 - jaro)` per shared leading character, up to four.
 * The `strcmp95` extensions are not applied (similar-character table, long-string adjustment,
 * digits ending the shared prefix, case and space folding), matching rapidfuzz and Apache.
 *
 * Compares Unicode code points exactly as given: normalize first (see `normalizeText`).
 * Two empty strings are identical (1); one empty string shares nothing (0).
 *
 * @example jaroWinkler('martha', 'marhta') // 0.9611...
 */
export function jaroWinkler(a: string, b: string): number {
  const s1 = Array.from(a);
  const s2 = Array.from(b);
  const j = jaro(s1, s2);
  if (j <= BOOST_THRESHOLD) return j;
  let prefix = 0;
  while (prefix < MAX_PREFIX && prefix < s1.length && s1[prefix] === s2[prefix]) prefix++;
  return j + prefix * PREFIX_SCALE * (1 - j);
}

function jaro(s1: readonly string[], s2: readonly string[]): number {
  if (s1.length === 0 && s2.length === 0) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const window = Math.max(0, Math.floor(Math.max(s1.length, s2.length) / 2) - 1);
  const matched1: boolean[] = new Array(s1.length).fill(false);
  const matched2: boolean[] = new Array(s2.length).fill(false);
  let matches = 0;
  for (let i = 0; i < s1.length; i++) {
    const end = Math.min(i + window + 1, s2.length);
    for (let k = Math.max(0, i - window); k < end; k++) {
      if (matched2[k] || s1[i] !== s2[k]) continue;
      matched1[i] = true;
      matched2[k] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  // Walk both strings' matched characters in order; each mismatch is half a transposition,
  // rounded down as in strcmp95 (an odd count is not split).
  let outOfOrder = 0;
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!matched1[i]) continue;
    while (!matched2[k]) k++;
    if (s1[i] !== s2[k]) outOfOrder++;
    k++;
  }
  const transpositions = Math.floor(outOfOrder / 2);
  return (matches / s1.length + matches / s2.length + (matches - transpositions) / matches) / 3;
}
