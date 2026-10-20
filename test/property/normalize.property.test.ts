import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type AddressLike,
  type HumanNameLike,
  type NormalizedAddress,
  type NormalizedName,
  normalizeAddress,
  normalizeBirthDate,
  normalizeCpf,
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
// Weighted so most words hit a rule; the arbitrary strings keep the rules honest.
const weightedWord = fc.oneof(
  { arbitrary: nameWord, weight: 1 },
  {
    arbitrary: fc.constantFrom('Dr.', 'Sra', 'RN', 'de', 'Filho', 'UNKNOWN', 'Ana', 'Souza'),
    weight: 2,
  },
);
const nameString = fc.array(weightedWord, { maxLength: 4 }).map((words) => words.join(' '));

const humanName: fc.Arbitrary<HumanNameLike> = fc.oneof(
  fc.record(
    {
      text: nameString,
      family: nameString,
      given: fc.array(nameString, { maxLength: 3 }),
      prefix: fc.array(nameString, { maxLength: 2 }),
      suffix: fc.array(nameString, { maxLength: 2 }),
    },
    { requiredKeys: [] },
  ),
  // Text-only names exercise the text parser, which structured names bypass.
  fc.record({ text: nameString }),
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
const repeated = (digits: string) => /^(\d)\1*$/.test(digits);
/** Valid Brazilian national numbers by construction (Anatel plan), placeholders excluded. */
const brNational = fc
  .oneof(
    fc.tuple(fc.constantFrom(...BR_DDD), digitString(8, 8)).map(([ddd, rest]) => `${ddd}9${rest}`),
    fc
      .tuple(fc.constantFrom(...BR_DDD), fc.constantFrom('2', '3', '4', '5'), digitString(7, 7))
      .map(([ddd, first, rest]) => `${ddd}${first}${rest}`),
  )
  .filter((n) => !repeated(n.slice(-8)));
/** Valid NANP numbers by construction: geographic NPA, NXX not N11, placeholders excluded. */
const usNational = fc
  .tuple(
    fc.constantFrom('212', '312', '415', '617', '702'),
    fc.constantFrom('2', '3', '5', '8'),
    digitString(6, 6),
  )
  .map(([npa, first, rest]) => `${npa}${first}${rest}`)
  .filter((n) => !n.slice(3, 6).endsWith('11') && !repeated(n.slice(3)));
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
          expect(plain).toBeDefined();
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
          expect(plain).toBeDefined();
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
        expect(plain).toBe(email.toLowerCase());
        expect(normalizeEmail(`  ${email.toUpperCase()} `)).toBe(plain);
      }),
    );
  });
});

// --- birth dates ---

const pad = (n: number, width: number) => String(n).padStart(width, '0');

describe('normalizeBirthDate properties', () => {
  // Oracle: the JavaScript Date calendar, independent of the hand-written leap-year rule.
  it('accepts a full date exactly when it exists in the calendar', () => {
    fc.assert(
      fc.property(
        // Biased toward calendar edges (centuries, leap years, month ends) so they are always hit.
        fc.oneof(
          fc.integer({ min: 1900, max: 2200 }),
          fc.constantFrom(1900, 2000, 2023, 2024, 2100, 2200),
        ),
        fc.oneof(fc.integer({ min: 0, max: 13 }), fc.constantFrom(2, 4)),
        fc.oneof(fc.integer({ min: 0, max: 32 }), fc.constantFrom(28, 29, 30, 31)),
        (year, month, day) => {
          const value = `${year}-${pad(month, 2)}-${pad(day, 2)}`;
          const probe = new Date(Date.UTC(year, month - 1, day));
          const exists =
            month >= 1 &&
            day >= 1 &&
            probe.getUTCMonth() === month - 1 &&
            probe.getUTCDate() === day &&
            value !== '1900-01-01';
          const result = normalizeBirthDate(value);
          expect(result !== undefined).toBe(exists);
          if (result !== undefined) {
            expect([result.year, result.month, result.day]).toEqual([year, month, day]);
          }
        },
      ),
      // Leap-day edges always run: centuries (1900, 2100 not leap; 2000 leap) and ordinary years.
      {
        examples: [
          [1900, 2, 29],
          [2000, 2, 29],
          [2100, 2, 29],
          [2023, 2, 29],
          [2024, 2, 29],
        ],
      },
    );
  });

  it('keeps every truncation of a valid date at its own precision', () => {
    fc.assert(
      fc.property(
        fc.date({
          min: new Date('1900-01-02T00:00:00Z'),
          max: new Date('2200-12-31T00:00:00Z'),
          noInvalidDate: true,
        }),
        (date) => {
          const iso = date.toISOString().slice(0, 10);
          expect(normalizeBirthDate(iso)?.precision).toBe('day');
          expect(normalizeBirthDate(iso.slice(0, 7))?.precision).toBe('month');
          expect(normalizeBirthDate(iso.slice(0, 4))?.precision).toBe('year');
        },
      ),
    );
  });

  it('is idempotent through its value', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.date({ noInvalidDate: true }).map((d) => d.toISOString().slice(0, 10)),
        ),
        (s) => {
          const once = normalizeBirthDate(s);
          if (once === undefined) return;
          expect(normalizeBirthDate(once.value)).toEqual(once);
        },
      ),
    );
  });
});

// --- CPF ---

/**
 * Oracle: the check digit as the Receita Federal rule is usually published
 * (remainder of the weighted sum by 11; below 2 gives 0, otherwise 11 minus the remainder).
 * The code under test uses the equivalent (10 x sum mod 11) mod 10 form.
 */
function publishedCheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += Number(body[i]) * (body.length + 1 - i);
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
}
const cpfBody = digitString(9, 9).filter(
  (b) => !repeated(b) && b !== '123456789' && b !== '012345678',
);

describe('normalizeCpf properties', () => {
  it('accepts every CPF built with the published rule, with or without formatting', () => {
    fc.assert(
      fc.property(cpfBody, fc.boolean(), (body, formatted) => {
        const d1 = publishedCheckDigit(body);
        const cpf = `${body}${d1}${publishedCheckDigit(`${body}${d1}`)}`;
        const input = formatted
          ? `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`
          : cpf;
        expect(normalizeCpf(input)).toBe(cpf);
      }),
    );
  });

  it('accepts exactly one of the 100 possible check-digit pairs for a body', () => {
    fc.assert(
      fc.property(cpfBody, (body) => {
        const accepted = Array.from({ length: 100 }, (_, i) => `${body}${pad(i, 2)}`).filter(
          (cpf) => normalizeCpf(cpf) !== undefined,
        );
        expect(accepted).toHaveLength(1);
      }),
    );
  });
});

// --- addresses ---

const addressWord = fc.oneof(
  fc.constantFrom(
    'R.',
    'Rua',
    'Av.',
    'Dr.',
    'St',
    'N',
    'nº',
    'no',
    'Nº',
    'numero',
    '100',
    '5th',
    'das',
    'Flores',
    'N/A',
    'unknown',
    'Não',
    'informado',
    'S/N',
    'constructor',
    'Apto',
    '#4B',
    ',',
  ),
  fc.string({ unit: 'grapheme', maxLength: 6 }),
);
const addressLine = fc.array(addressWord, { maxLength: 6 }).map((w) => w.join(' '));
const postalCode = fc.oneof(
  digitString(8, 8).map((d) => `${d.slice(0, 5)}-${d.slice(5)}`),
  digitString(5, 5),
  digitString(9, 9),
  fc.constantFrom('SW1A 2AA', '00000-000', ''),
  fc.string({ maxLength: 10 }),
);
const address: fc.Arbitrary<AddressLike> = fc.record(
  {
    line: fc.array(addressLine, { maxLength: 2 }),
    city: fc.oneof(
      fc.constantFrom('Curitiba', 'São Paulo', 'Desconhecido'),
      fc.string({ maxLength: 8 }),
    ),
    state: fc.constantFrom('PR', 'Paraná', 'IL', ''),
    postalCode,
    country: fc.oneof(
      fc.constantFrom('BR', 'Brasil', 'US', 'USA', 'GB', ''),
      fc.string({ maxLength: 4 }),
    ),
  },
  { requiredKeys: [] },
);

/** Rebuilds an Address from a normalized one. */
function toAddress(a: NormalizedAddress): AddressLike {
  return {
    line: a.line === undefined ? [] : [a.line],
    city: a.city,
    state: a.state,
    postalCode: a.postalCode,
    country: a.country,
  };
}

describe('normalizeAddress properties', () => {
  it('is a fixed point when the country is known', () => {
    fc.assert(
      fc.property(address, (a) => {
        const once = normalizeAddress(a);
        if (once?.country === undefined) return;
        expect(normalizeAddress(toAddress(once))).toEqual(once);
      }),
    );
  });

  it('keeps any CEP or ZIP that is not a placeholder', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          digitString(8, 8)
            .filter((d) => !repeated(d) && !d.startsWith('00'))
            .map((code) => ({ code, country: 'BR' as const, want: code })),
          digitString(5, 5)
            .filter((d) => !repeated(d) && !d.startsWith('000'))
            .map((code) => ({ code, country: 'US' as const, want: code })),
        ),
        fc.boolean(),
        ({ code, country, want }, explicit) => {
          const result = normalizeAddress({
            postalCode: code,
            country: explicit ? country : undefined,
          });
          expect(result?.postalCode).toBe(want);
          expect(result?.country).toBe(country);
        },
      ),
    );
  });

  it('does not mutate its input', () => {
    fc.assert(
      fc.property(address, (a) => {
        const before = structuredClone(a);
        normalizeAddress(a);
        expect(a).toEqual(before);
      }),
    );
  });
});
