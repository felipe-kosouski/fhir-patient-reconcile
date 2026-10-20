import { describe, expect, it } from 'vitest';
import { jaroWinkler } from '../../../src/index.js';

const TOLERANCE = 0.001;

// [a, b, expected, source]. Every expected value is copied from a published source, not
// computed by this code.
const references: ReadonlyArray<readonly [string, string, number, string]> = [
  // W. E. Winkler (1990), "String Comparator Metrics and Enhanced Decision Rules in the
  // Fellegi-Sunter Model of Record Linkage": the canonical examples.
  ['MARTHA', 'MARHTA', 0.961, 'Winkler 1990'],
  ['DWAYNE', 'DUANE', 0.84, 'Winkler 1990'],
  ['DIXON', 'DICKSONX', 0.813, 'Winkler 1990'],
  // Apache Commons Text, JaroWinklerSimilarityTest (values truncated there, so within tolerance).
  ['', '', 1, 'Apache Commons Text'],
  ['foo', 'foo', 1, 'Apache Commons Text'],
  ['foo', 'foo ', 0.94166, 'Apache Commons Text'],
  ['foo', 'foo  ', 0.90666, 'Apache Commons Text'],
  ['foo', ' foo ', 0.86666, 'Apache Commons Text'],
  ['foo', '  foo', 0.51111, 'Apache Commons Text'],
  ['frog', 'fog', 0.92499, 'Apache Commons Text'],
  ['fly', 'ant', 0, 'Apache Commons Text'],
  ['elephant', 'hippo', 0.44166, 'Apache Commons Text'],
  ['ABC Corporation', 'ABC Corp', 0.90666, 'Apache Commons Text'],
  ['D N H Enterprises Inc', 'D & H Enterprises, Inc.', 0.95251, 'Apache Commons Text'],
  ["My Gym Children's Fitness Center", 'My Gym. Childrens Fitness', 0.942, 'Apache Commons Text'],
  ['PENNSYLVANIA', 'PENNCISYLVNIA', 0.898018, 'Apache Commons Text'],
  ['/opt/software1', '/opt/software2', 0.971428, 'Apache Commons Text'],
  ['John Horn', 'John Hopkins', 0.911111, 'Apache Commons Text'],
  // Apache's 'aaabcd' / 'aaacdb' = 0.941666 is left out on purpose: Apache does not round the
  // transposition count down, Winkler's strcmp95.c does (see the rapidfuzz rows below).
  // rapidfuzz 3.14.5 `JaroWinkler.similarity`, an independent implementation of strcmp95's rules.
  ['aaabcd', 'aaacdb', 0.961111, 'rapidfuzz (3 out of order -> 1 transposition)'],
  ['abcdefgh', 'abdcefhg', 0.933333, 'rapidfuzz'],
  ['souza', 'sousa', 0.906667, 'rapidfuzz'],
  ['silva', 'sliva', 0.94, 'rapidfuzz'],
  ['maria', 'mariana', 0.942857, 'rapidfuzz'],
  ['joao', 'joana', 0.848333, 'rapidfuzz'],
  ['abc', 'abcxyzuvw', 0.844444, 'rapidfuzz'],
  ['ferreira', 'pereira', 0.813492, 'rapidfuzz'],
  ['crate', 'trace', 0.733333, 'rapidfuzz'],
  ['abc', 'acb', 0.555556, 'rapidfuzz (Jaro <= 0.7: no prefix bonus)'],
  ['abxyz', 'abuvw', 0.6, 'rapidfuzz (Jaro <= 0.7: no prefix bonus)'],
];

describe('jaroWinkler: published reference values', () => {
  it.each(references)('%s / %s ≈ %d (%s)', (a, b, expected) => {
    expect(Math.abs(jaroWinkler(a, b) - expected)).toBeLessThanOrEqual(TOLERANCE);
  });
});

describe('jaroWinkler: definition details', () => {
  it('Wikipedia worked example: FAREMVIEL / FARMVILLE has Jaro 0.88 before the prefix bonus', () => {
    // Jaro = (8/9 + 8/9 + 7/8) / 3; prefix "FAR" adds 3 x 0.1 x (1 - Jaro).
    const jaro = (8 / 9 + 8 / 9 + 7 / 8) / 3;
    expect(jaroWinkler('FAREMVIEL', 'FARMVILLE')).toBeCloseTo(jaro + 0.3 * (1 - jaro), 10);
  });

  it('gives no prefix bonus when the Jaro score is 0.7 or less', () => {
    // 'abxyz' / 'abuvw': 2 of 5 match in order, Jaro = (0.4 + 0.4 + 1) / 3 = 0.6; prefix "ab".
    expect(jaroWinkler('abxyz', 'abuvw')).toBeCloseTo(0.6, 10);
  });

  it('rounds an odd count of out-of-order characters down', () => {
    // 'aaabcd' / 'aaacdb': 6 matches, b/c/d out of order (3), so 1 transposition, not 1.5.
    const jaro = (1 + 1 + 5 / 6) / 3;
    expect(jaroWinkler('aaabcd', 'aaacdb')).toBeCloseTo(jaro + 0.3 * (1 - jaro), 10);
  });

  it('caps the prefix bonus at four characters', () => {
    // Same Jaro score, prefixes of 4 and 6: the bonus is equal.
    expect(jaroWinkler('abcdefx', 'abcdefy')).toBeCloseTo(jaroWinkler('abcdxfg', 'abcdyfg'), 10);
  });

  it('one empty string shares nothing', () => {
    expect(jaroWinkler('', 'maria')).toBe(0);
    expect(jaroWinkler('maria', '')).toBe(0);
  });

  it('compares code points, so astral characters count once', () => {
    expect(jaroWinkler('a😀b', 'a😀b')).toBe(1);
    expect(jaroWinkler('😀', '😁')).toBe(0);
  });
});
