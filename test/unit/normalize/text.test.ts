import { describe, expect, it } from 'vitest';
import { normalizeText } from '../../../src/index.js';

// [input, expected, why]
const cases: ReadonlyArray<readonly [string, string, string]> = [
  ['João', 'joao', 'ã decomposes to a + combining tilde, which is dropped'],
  ['CONCEIÇÃO', 'conceicao', 'ç decomposes to c + combining cedilla; case is folded'],
  ['Zoë Müller', 'zoe muller', 'diaeresis is a combining mark'],
  ['Strauß', 'strauss', 'ß has no decomposition; folded by an explicit map'],
  ['Søren Łukasz', 'soren lukasz', 'ø and ł have no decomposition; folded by an explicit map'],
  ['  Maria   \t José \n', 'maria jose', 'whitespace runs collapse to one space and are trimmed'],
  ["O'Brien", 'obrien', 'apostrophes join the parts instead of splitting the token'],
  ['D’Ávila', 'davila', 'typographic apostrophe behaves like the ASCII one'],
  ['Silva-Souza', 'silva souza', 'hyphens split tokens, so compound surnames compare per part'],
  ['Jr.', 'jr', 'other punctuation is removed'],
  ['Ｍａｒｉａ', 'maria', 'full-width letters fold to ASCII under compatibility decomposition'],
  ['Unit 12B', 'unit 12b', 'digits are kept'],
  ['', '', 'empty stays empty'],
  ['.,;-', '', 'punctuation only becomes empty'],
  [
    'Ἀλέξανδρος', // Ἀλέξανδρος
    'αλεξανδρος', // αλεξανδρος (final sigma kept)
    'non-Latin letters are kept, lowercased and stripped of marks',
  ],
];

describe('normalizeText', () => {
  it.each(cases)('%j -> %j (%s)', (input, expected) => {
    expect(normalizeText(input)).toBe(expected);
  });
});
