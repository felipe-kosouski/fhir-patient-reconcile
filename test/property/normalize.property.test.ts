import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type HumanNameLike,
  type NormalizedName,
  normalizeEmail,
  normalizeName,
  normalizePhone,
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
    'RN',
    'Bebê',
    'Recém-Nascido',
    'Baby',
    'Girl',
    'John',
    'Doe',
    'Fulano',
    'Tal',
    'UNKNOWN',
    'Não',
    'Informado',
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

// --- phones ---

const digitString = (min: number, max: number) =>
  fc
    .array(fc.constantFrom(...'0123456789'), { minLength: min, maxLength: max })
    .map((d) => d.join(''));
const BR_DDD = ['11', '21', '41', '55', '61', '71', '85', '91', '99'];
/** National significant numbers that are well-formed by construction (placeholders possible). */
const brNational = fc.oneof(
  fc.tuple(fc.constantFrom(...BR_DDD), digitString(8, 8)).map(([ddd, rest]) => `${ddd}9${rest}`),
  fc
    .tuple(fc.constantFrom(...BR_DDD), fc.constantFrom('2', '3', '4', '5'), digitString(7, 7))
    .map(([ddd, first, rest]) => `${ddd}${first}${rest}`),
);
const usNational = fc
  .tuple(
    fc.constantFrom('212', '312', '415', '617', '702'),
    fc.constantFrom('2', '3', '5', '8'),
    digitString(6, 6),
  )
  .map(([npa, first, rest]) => `${npa}${first}${rest}`);
const separator = fc.constantFrom('', ' ', '-', '.', '  ');

/** Formats a digit string with random separators and optional parentheses around the area code. */
function formatted(national: string, areaLength: number) {
  return fc
    .tuple(
      fc.boolean(),
      fc.array(separator, { minLength: national.length, maxLength: national.length }),
    )
    .map(([parens, seps]) => {
      const area = national.slice(0, areaLength);
      const rest = [...national.slice(areaLength)].map((d, i) => `${seps[i] ?? ''}${d}`).join('');
      return parens ? `(${area})${rest}` : `${area}${rest}`;
    });
}

describe('normalizePhone properties', () => {
  it('is idempotent through its E.164 output', () => {
    fc.assert(
      fc.property(
        fc.oneof(brNational, usNational, fc.string()),
        fc.constantFrom('BR', 'US', undefined),
        (s, c) => {
          const once = normalizePhone(s, { defaultCountry: c });
          if (once === undefined) return;
          const twice = normalizePhone(once.e164);
          expect(twice?.e164).toBe(once.e164);
          expect(twice?.line).toBe(once.line);
        },
      ),
    );
  });

  it('ignores formatting: separators, parentheses and country code give the same result', () => {
    fc.assert(
      fc.property(
        brNational.chain((n) =>
          fc.tuple(fc.constant(n), formatted(n, 2), fc.constantFrom('', '+55 ', '0055 ', '0')),
        ),
        ([national, pretty, prefix]) => {
          const plain = normalizePhone(national, { defaultCountry: 'BR' });
          expect(normalizePhone(`${prefix}${pretty}`, { defaultCountry: 'BR' })).toEqual(plain);
        },
      ),
    );
    fc.assert(
      fc.property(
        usNational.chain((n) =>
          fc.tuple(fc.constant(n), formatted(n, 3), fc.constantFrom('', '+1 ', '1-')),
        ),
        ([national, pretty, prefix]) => {
          const plain = normalizePhone(national, { defaultCountry: 'US' });
          expect(normalizePhone(`${prefix}${pretty}`, { defaultCountry: 'US' })).toEqual(plain);
        },
      ),
    );
  });

  it('only ever outputs +55 or +1 numbers of the right length', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), fc.constantFrom('BR', 'US', undefined), (s, c) => {
        const result = normalizePhone(s, { defaultCountry: c });
        if (result === undefined) return;
        expect(result.e164).toMatch(/^(\+55\d{10,11}|\+1\d{10})$/);
      }),
    );
  });
});

// --- emails ---

describe('normalizeEmail properties', () => {
  it('is idempotent', () => {
    fc.assert(
      fc.property(fc.oneof(fc.emailAddress(), fc.string({ unit: 'binary' })), (s) => {
        const once = normalizeEmail(s);
        if (once === undefined) return;
        expect(normalizeEmail(once)).toBe(once);
      }),
    );
  });

  it('accepts generated valid addresses regardless of case and surrounding space', () => {
    fc.assert(
      fc.property(fc.emailAddress(), (email) => {
        const plain = normalizeEmail(email);
        expect(normalizeEmail(`  ${email.toUpperCase()} `)).toBe(plain);
      }),
    );
  });
});
