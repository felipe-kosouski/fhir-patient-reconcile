import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type HumanNameLike,
  type NormalizedName,
  normalizeName,
  normalizeText,
} from '../../src/index.js';

// Name-like words that hit the special rules (accents, particles, suffixes, titles,
// punctuation), mixed with arbitrary Unicode so the rules also meet unexpected input.
const nameWord = fc.oneof(
  fc.constantFrom(
    'João',
    'MARIA',
    'José',
    'Conceição',
    "O'Brien",
    'Silva-Souza',
    'da',
    'De',
    'dos',
    'e',
    'Filho',
    'Neto',
    'Jr.',
    'Júnior',
    'III',
    'Sr',
    'Dr.',
    'Dra',
    'Strauß',
    'Ｍａｒｉａ',
    '...',
    ' ',
  ),
  fc.string({ unit: 'grapheme', maxLength: 8 }),
  fc.string({ unit: 'binary', maxLength: 8 }),
);
const nameString = fc.array(nameWord, { maxLength: 4 }).map((words) => words.join(' '));

const humanName: fc.Arbitrary<HumanNameLike> = fc.record(
  {
    text: nameString,
    family: nameString,
    given: fc.array(nameString, { maxLength: 3 }),
    prefix: fc.array(nameString, { maxLength: 2 }),
    suffix: fc.array(nameString, { maxLength: 2 }),
  },
  { requiredKeys: [] },
);

/** Rebuilds a structured HumanName from a normalized one. */
function toHumanName(n: NormalizedName): HumanNameLike {
  return {
    given: n.given === undefined ? [] : [n.given, ...n.middle],
    family: n.family.join(' '),
    suffix: n.suffix === undefined ? [] : [n.suffix],
  };
}

describe('normalizeText properties', () => {
  it('is idempotent', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (s) => {
        const once = normalizeText(s);
        expect(normalizeText(once)).toBe(once);
      }),
    );
  });

  it('outputs no leading, trailing or repeated spaces', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (s) => {
        expect(normalizeText(s)).not.toMatch(/^ | $| {2}/);
      }),
    );
  });
});

describe('normalizeName properties', () => {
  it('is a fixed point: normalizing the normalized name again changes nothing', () => {
    fc.assert(
      fc.property(humanName, (name) => {
        const once = normalizeName(name);
        if (once === undefined) return;
        const { source: _ignored, ...twice } = normalizeName(toHumanName(once)) ?? {};
        const { source: _alsoIgnored, ...expected } = once;
        expect(twice).toEqual(expected);
      }),
    );
  });

  it('never returns empty tokens or tokens that need normalizing', () => {
    fc.assert(
      fc.property(humanName, (name) => {
        const n = normalizeName(name);
        if (n === undefined) return;
        const tokens = [...(n.given === undefined ? [] : [n.given]), ...n.middle, ...n.family];
        for (const token of tokens) {
          expect(token).not.toBe('');
          expect(token).not.toContain(' ');
          expect(normalizeText(token)).toBe(token);
        }
      }),
    );
  });

  it('does not mutate its input', () => {
    fc.assert(
      fc.property(humanName, (name) => {
        const before = structuredClone(name);
        normalizeName(name);
        expect(name).toEqual(before);
      }),
    );
  });
});
