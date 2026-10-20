import { describe, expect, it } from 'vitest';
import { damerauLevenshtein } from '../../../src/index.js';

// [a, b, expected, why]
const cases: ReadonlyArray<readonly [string, string, number, string]> = [
  ['CA', 'ABC', 2, 'Wikipedia: CA -> AC -> ABC; optimal string alignment would give 3'],
  ['kitten', 'sitting', 3, 'classic Levenshtein example; no swaps help'],
  ['maria', 'mraia', 1, 'one adjacent swap'],
  ['1987', '1978', 1, 'swapped year digits are one edit'],
  ['souza', 'sousa', 1, 'one substitution'],
  ['silva', 'silvaa', 1, 'one insertion'],
  ['ab', 'ba', 1, 'a swap is one edit, not two substitutions'],
  ['ABC', 'CA', 2, 'the distance is symmetric, so the reverse of CA -> ABC is also 2'],
  ['', 'abc', 3, 'from empty: one insertion per character'],
  ['abc', '', 3, 'to empty: one deletion per character'],
  ['', '', 0, 'two empty strings'],
  ['souza', 'souza', 0, 'identical'],
  ['a😀b', 'ab😀', 1, 'code points: an emoji swaps like one character'],
  // rapidfuzz 3.14.5 `DamerauLevenshtein.distance` (unrestricted), an independent implementation.
  ['ferreira', 'pereira', 2, 'rapidfuzz'],
  ['joao', 'joana', 2, 'rapidfuzz'],
  ['maria', 'mariana', 2, 'rapidfuzz'],
  ['abcdef', 'badcfe', 3, 'rapidfuzz: three separate swaps'],
  ['apple', 'ppale', 2, 'rapidfuzz'],
];

describe('damerauLevenshtein', () => {
  it.each(cases)('%s -> %s = %d (%s)', (a, b, expected) => {
    expect(damerauLevenshtein(a, b)).toBe(expected);
  });
});
