import { describe, expect, it } from 'vitest';
import { type HumanNameLike, type PatientLike, RNDS_CPF_SYSTEM } from '../../../src/index.js';
import { compareFields } from '../../../src/match/compare/index.js';
import { isGenderedPair } from '../../../src/match/compare/names.js';
import type { FieldOutcome, MatchField, MatchOptions } from '../../../src/match/types.js';

// All data is synthetic: invented names, example.com emails, NANP 555-01xx, patterned Brazilian
// numbers, Ofcom's drama range (020 7946 0xxx) and CPFs built with the check-digit rule.

type Fields = Omit<PatientLike, 'resourceType'>;
const patient = (fields: Fields): PatientLike => ({ resourceType: 'Patient', ...fields });

function result(field: MatchField, local: Fields, incoming: Fields, options?: MatchOptions) {
  const found = compareFields(patient(local), patient(incoming), options).fields.find(
    (r) => r.field === field,
  );
  if (found === undefined) throw new Error(`no result for ${field}`);
  return found;
}

interface Case {
  local: Fields;
  incoming: Fields;
  options?: MatchOptions;
  outcome: FieldOutcome;
  points: number;
  why: string;
}

function table(field: MatchField, cases: readonly Case[]) {
  describe(field, () => {
    it.each(cases)('$why', ({ local, incoming, options, outcome, points }) => {
      const r = result(field, local, incoming, options);
      expect({ outcome: r.outcome, points: r.points }).toEqual({ outcome, points });
    });
  });
}

const n = (given: readonly string[], family?: string) =>
  family === undefined ? { given } : { given, family };
const phone = (value: string, system = 'phone') => ({ system, value });
const email = (value: string) => ({ system: 'email', value });
const cpf = (value: string) => ({ system: RNDS_CPF_SYSTEM, value });
const BR = { defaultCountry: 'BR' } as const;
const US = { defaultCountry: 'US' } as const;

table('given', [
  {
    local: { name: [n(['João'], 'Souza')] },
    incoming: { name: [n(['JOAO'], 'Souza')] },
    outcome: 'exact',
    points: 4,
    why: 'equal after case and accent folding',
  },
  {
    local: { name: [n(['Gabriela'], 'Souza')] },
    incoming: { name: [n(['Grabiela'], 'Souza')] },
    outcome: 'fuzzy',
    points: 2,
    why: 'a one-letter typo is above the 0.92 Jaro-Winkler cut-off',
  },
  {
    local: { name: [n(['Gabriela'], 'Souza')] },
    incoming: { name: [n(['Grabiela'], 'Souza')] },
    options: { nameSimilarity: { fuzzyMin: 0.99 } },
    outcome: 'conflict',
    points: -3,
    why: 'the cut-off is configurable',
  },
  {
    local: { name: [n(['Lucas'], 'Souza')] },
    incoming: { name: [n(['Mateus'], 'Souza')] },
    outcome: 'conflict',
    points: -3,
    why: 'different first names (twins)',
  },
  {
    local: { name: [n(['RN de Maria'], 'Souza')] },
    incoming: { name: [n(['Lucas'], 'Souza')] },
    outcome: 'missing',
    points: 0,
    why: 'a newborn placeholder name is missing, not a disagreement',
  },
  {
    local: { name: [{ family: 'Souza' }] },
    incoming: { name: [n(['Lucas'], 'Souza')] },
    outcome: 'missing',
    points: 0,
    why: 'no given name on one side',
  },
  {
    local: { name: [n([`${'a'.repeat(101)}b`])] },
    incoming: { name: [n([`${'a'.repeat(101)}c`])] },
    outcome: 'conflict',
    points: -3,
    why: 'tokens over 100 characters are compared for equality only',
  },
]);

table('family', [
  {
    local: { name: [n(['Maria'], 'da Silva Souza')] },
    incoming: { name: [n(['Maria'], 'Souza')] },
    outcome: 'exact',
    points: 4,
    why: 'one set of family names inside the other; "da" is a particle',
  },
  {
    local: { name: [n(['Ana'], 'Silva Souza')] },
    incoming: { name: [n(['Ana'], 'Souza Silva')] },
    outcome: 'exact',
    points: 4,
    why: 'order does not matter',
  },
  {
    local: { name: [n(['Maria'], 'Silva Souza')] },
    incoming: { name: [n(['Maria'], 'Souza Oliveira')] },
    outcome: 'fuzzy',
    points: 2,
    why: 'a partial overlap',
  },
  {
    local: { name: [n(['Maria'], 'Oliveira')] },
    incoming: { name: [n(['Maria'], 'Olivera')] },
    outcome: 'fuzzy',
    points: 2,
    why: 'a near spelling',
  },
  {
    local: { name: [n(['Maria'], 'Souza')] },
    incoming: { name: [n(['Maria'], 'Oliveira')] },
    outcome: 'conflict',
    points: -3,
    why: 'no family name in common',
  },
  {
    local: { name: [n(['José'], 'Souza Filho')] },
    incoming: { name: [n(['José'], 'Souza')] },
    outcome: 'exact',
    points: 4,
    why: 'a generational suffix is not a family name',
  },
  {
    local: { name: [n(['João'], 'Souza')] },
    incoming: { name: [{ text: 'João Souza Pereira' }] },
    outcome: 'exact',
    points: 4,
    why: 'for a name from text, the middle tokens count as family names ("souza" is one)',
  },
  {
    local: { name: [{ given: ['Ana'] }, { family: 'Souza' }] },
    incoming: { name: [{ family: 'Pereira' }] },
    outcome: 'conflict',
    points: -3,
    why: 'a name pair with nothing comparable does not hide a conflicting pair',
  },
  {
    local: { name: [n(['Maria'], 'Souza'), n(['Maria'], 'Oliveira')] },
    incoming: { name: [n(['Maria'], 'Oliveira')] },
    outcome: 'exact',
    points: 4,
    why: 'every name is tried: a second (married) name matches',
  },
]);

table('middle', [
  {
    local: { name: [n(['João', 'Pedro'], 'Souza')] },
    incoming: { name: [{ text: 'João Pedro Souza' }] },
    outcome: 'exact',
    points: 1,
    why: 'the same middle name from parts and from text',
  },
  {
    local: { name: [n(['João', 'Pedro'], 'Souza')] },
    incoming: { name: [n(['João'], 'Souza')] },
    outcome: 'missing',
    points: 0,
    why: 'a missing middle name never penalizes',
  },
  {
    local: { name: [n(['Emily', 'J.'], 'Carter')] },
    incoming: { name: [n(['Emily', 'Jane'], 'Carter')] },
    outcome: 'fuzzy',
    points: 0.5,
    why: 'a middle initial agrees with the full middle name',
  },
  {
    local: { name: [n(['Emily', 'Jane'], 'Carter')] },
    incoming: { name: [n(['Emily', 'J'], 'Carter')] },
    outcome: 'fuzzy',
    points: 0.5,
    why: 'the initial may be on either side',
  },
  {
    local: { name: [n(['Emily', 'Rose'], 'Carter')] },
    incoming: { name: [n(['Emily', 'Jane'], 'Carter')] },
    outcome: 'conflict',
    points: 0,
    why: 'different middle names cost nothing by default',
  },
  {
    local: { name: [n(['Ana', 'Paula'], 'Souza')] },
    incoming: { name: [n(['Ana', 'Paulo'], 'Souza')] },
    outcome: 'conflict',
    points: 0,
    why: 'masculine and feminine forms of a middle name are not a near spelling',
  },
]);

table('birthDate', [
  {
    local: { birthDate: '1987-03-14' },
    incoming: { birthDate: '1987-03-14' },
    outcome: 'exact',
    points: 5,
    why: 'equal dates',
  },
  {
    local: { birthDate: '1987-03-04' },
    incoming: { birthDate: '1987-04-03' },
    outcome: 'fuzzy',
    points: 2,
    why: 'day and month swapped',
  },
  {
    local: { birthDate: '1985-12-31' },
    incoming: { birthDate: '1986-01-01' },
    outcome: 'fuzzy',
    points: 2,
    why: 'one day apart across a year boundary',
  },
  {
    local: { birthDate: '2024-02-28' },
    incoming: { birthDate: '2024-02-29' },
    outcome: 'fuzzy',
    points: 2,
    why: 'one day apart into a leap day',
  },
  {
    local: { birthDate: '2023-02-28' },
    incoming: { birthDate: '2023-03-01' },
    outcome: 'fuzzy',
    points: 2,
    why: 'one day apart across February in a common year',
  },
  {
    local: { birthDate: '2024-02-28' },
    incoming: { birthDate: '2024-03-01' },
    outcome: 'conflict',
    points: -6,
    why: 'two days apart in a leap year',
  },
  {
    local: { birthDate: '1987-03-14' },
    incoming: { birthDate: '1981-03-14' },
    outcome: 'fuzzy',
    points: 2,
    why: 'one mistyped year digit',
  },
  {
    local: { birthDate: '1987-03-14' },
    incoming: { birthDate: '1978-03-14' },
    outcome: 'conflict',
    points: -6,
    why: 'two year digits differ (the plan allows one)',
  },
  {
    local: { birthDate: '1975-02-10' },
    incoming: { birthDate: '2001-09-23' },
    outcome: 'conflict',
    points: -6,
    why: 'decades apart',
  },
  {
    local: { birthDate: '1987' },
    incoming: { birthDate: '1987-03-14' },
    outcome: 'missing',
    points: 0,
    why: 'a year that agrees cannot confirm a full date',
  },
  {
    local: { birthDate: '1987-03' },
    incoming: { birthDate: '1987-03-14' },
    outcome: 'missing',
    points: 0,
    why: 'a month that agrees cannot confirm a full date',
  },
  {
    local: { birthDate: '1987' },
    incoming: { birthDate: '1962-08-19' },
    outcome: 'conflict',
    points: -6,
    why: 'a partial date still disproves',
  },
  {
    local: { birthDate: '1987-03' },
    incoming: { birthDate: '1987-04-14' },
    outcome: 'conflict',
    points: -6,
    why: 'the month disagrees at the shared precision',
  },
  {
    local: { birthDate: '1900-01-01' },
    incoming: { birthDate: '1900-01-01' },
    outcome: 'missing',
    points: 0,
    why: 'equal placeholders are missing on both sides',
  },
]);

table('phone', [
  {
    local: { telecom: [phone('(41) 99876-5432')] },
    incoming: { telecom: [phone('+55 41 99876 5432')] },
    outcome: 'exact',
    points: 4,
    why: 'same number after formatting and country code',
  },
  {
    local: { telecom: [phone('(41) 9876-5432')] },
    incoming: { telecom: [phone('(41) 99876-5432')] },
    options: BR,
    outcome: 'exact',
    points: 4,
    why: 'an old 8-digit Brazilian mobile gains its ninth digit',
  },
  {
    local: { telecom: [phone('(212) 555-0147')] },
    incoming: { telecom: [phone('212.555.0147', 'sms')] },
    options: US,
    outcome: 'exact',
    points: 4,
    why: 'sms contact points carry phone numbers too',
  },
  {
    local: { telecom: [phone('(212) 555-0147', 'fax')] },
    incoming: { telecom: [phone('(212) 555-0147')] },
    options: US,
    outcome: 'missing',
    points: 0,
    why: 'a fax number is not compared',
  },
  {
    local: { telecom: [phone('(11) 98765-4321')] },
    incoming: { telecom: [phone('(21) 97654-3210')] },
    outcome: 'conflict',
    points: -1,
    why: 'different numbers cost little: phones change',
  },
  {
    local: { telecom: [phone('(41) 99999-9999')] },
    incoming: { telecom: [phone('(41) 99999-9999')] },
    outcome: 'missing',
    points: 0,
    why: 'equal placeholders are not agreement',
  },
  {
    local: { telecom: [phone('020 7946 0123')] },
    incoming: { telecom: [phone('+44 20 7946 0123')] },
    outcome: 'missing',
    points: 0,
    why: 'the built-in parser knows only Brazil and NANP',
  },
  {
    local: { telecom: [phone('020 7946 0123')] },
    incoming: { telecom: [phone('+44 20 7946 0123')] },
    options: { normalizePhone: (v) => `+44${v.replace(/\D/g, '').replace(/^(?:44|0)/, '')}` },
    outcome: 'exact',
    points: 4,
    why: 'a custom normalizer replaces the built-in parser',
  },
  {
    local: { telecom: [phone('(41) 99876-5432')] },
    incoming: { telecom: [phone('(41) 99876-5432')] },
    options: { normalizePhone: () => '' },
    outcome: 'missing',
    points: 0,
    why: 'a custom normalizer returning an empty string means unusable',
  },
]);

table('email', [
  {
    local: { telecom: [email('Emily.Carter@Example.com')] },
    incoming: { telecom: [email('emily.carter@example.com')] },
    outcome: 'exact',
    points: 4,
    why: 'case is not significant',
  },
  {
    local: { telecom: [email('maria.silva@example.com')] },
    incoming: { telecom: [email('m.silva90@example.com')] },
    outcome: 'conflict',
    points: -1,
    why: 'different addresses',
  },
  {
    local: { telecom: [email('noemail@example.com')] },
    incoming: { telecom: [email('noemail@example.com')] },
    outcome: 'missing',
    points: 0,
    why: 'a placeholder address is missing',
  },
]);

table('identifier', [
  {
    local: { identifier: [cpf('111.444.777-35')] },
    incoming: { identifier: [cpf('11144477735')] },
    outcome: 'exact',
    points: 10,
    why: 'the same CPF, formatted and bare',
  },
  {
    local: { identifier: [cpf('111.444.777-35')] },
    incoming: { identifier: [cpf('333.444.555-08')] },
    outcome: 'conflict',
    points: -10,
    why: 'two valid, different CPFs',
  },
  {
    local: { identifier: [cpf('000.000.000-00')] },
    incoming: { identifier: [cpf('000.000.000-00')] },
    outcome: 'missing',
    points: 0,
    why: 'a placeholder CPF is missing',
  },
  {
    local: { identifier: [cpf('111.444.777-35')] },
    incoming: { identifier: [cpf('111.444.777-36')] },
    outcome: 'missing',
    points: 0,
    why: 'a CPF with a wrong check digit is unusable, not a conflict',
  },
  {
    local: { identifier: [{ system: 'urn:example:clinic-a:mrn', value: 'A-1001' }] },
    incoming: { identifier: [{ system: 'urn:example:clinic-a:mrn', value: 'A-1001' }] },
    outcome: 'missing',
    points: 0,
    why: 'a system nobody configured does not score',
  },
  {
    local: { identifier: [{ value: '12345' }] },
    incoming: { identifier: [{ value: '12345' }] },
    outcome: 'missing',
    points: 0,
    why: 'a value without a system does not score',
  },
  {
    local: { identifier: [{ system: 'urn:example:clinic-a:mrn', value: ' A-1001 ' }] },
    incoming: { identifier: [{ system: 'urn:example:clinic-a:mrn', value: 'A-1001' }] },
    options: { identifierSystems: { trusted: ['urn:example:clinic-a:mrn'] } },
    outcome: 'exact',
    points: 10,
    why: 'a configured system scores; values are trimmed',
  },
  {
    local: { identifier: [cpf('111.444.777-35')] },
    incoming: { identifier: [cpf('111.444.777-35')] },
    options: { identifierSystems: { trusted: ['urn:example:clinic-a:mrn'] } },
    outcome: 'missing',
    points: 0,
    why: 'a configured list replaces the default one',
  },
  {
    local: {
      identifier: [cpf('111.444.777-35'), { system: 'urn:example:clinic-a:mrn', value: 'A-1' }],
    },
    incoming: {
      identifier: [cpf('111.444.777-35'), { system: 'urn:example:clinic-a:mrn', value: 'A-2' }],
    },
    options: { identifierSystems: { trusted: [RNDS_CPF_SYSTEM, 'urn:example:clinic-a:mrn'] } },
    outcome: 'conflict',
    points: -10,
    why: 'one disagreeing trusted system is a conflict even when another agrees (fail closed)',
  },
]);

table('address', [
  {
    local: {
      address: [{ line: ['R. das Flores, nº 100'], postalCode: '80010-000', country: 'BR' }],
    },
    incoming: { address: [{ line: ['Rua das Flores 100'], postalCode: '80010000' }] },
    outcome: 'exact',
    points: 3,
    why: 'same CEP and street line after abbreviations',
  },
  {
    local: { address: [{ line: ['Rua das Flores 100'], postalCode: '80010-000' }] },
    incoming: { address: [{ line: ['Rua das Flores 102'], postalCode: '80010-000' }] },
    outcome: 'fuzzy',
    points: 1,
    why: 'same CEP, different street line',
  },
  {
    local: { address: [{ postalCode: '80010-000' }] },
    incoming: { address: [{ line: ['Rua das Flores 100'], postalCode: '80010-000' }] },
    outcome: 'fuzzy',
    points: 1,
    why: 'same CEP, street line missing on one side',
  },
  {
    local: { address: [{ line: ['Rua das Flores 100'], postalCode: '80010-000' }] },
    incoming: { address: [{ line: ['Rua das Flores 100'], postalCode: '01310-100' }] },
    outcome: 'conflict',
    points: -1,
    why: 'different CEPs: the same street name exists in many cities',
  },
  {
    local: { address: [{ line: ['500 Oak Dr'], country: 'US' }] },
    incoming: { address: [{ line: ['500 Oak Drive'], city: 'Springfield', country: 'US' }] },
    outcome: 'fuzzy',
    points: 1,
    why: 'same street line without postal codes',
  },
  {
    local: { address: [{ line: ['500 Oak Dr'], country: 'US' }] },
    incoming: { address: [{ line: ['12 Elm St'], country: 'US' }] },
    outcome: 'conflict',
    points: -1,
    why: 'different street lines without postal codes',
  },
  {
    local: { address: [{ city: 'Curitiba' }] },
    incoming: { address: [{ city: 'Curitiba' }] },
    outcome: 'missing',
    points: 0,
    why: 'a city alone is not compared',
  },
  {
    local: { address: [{ line: ['10 Main'], country: 'US' }] },
    incoming: { address: [{ line: ['10 Main'], country: 'Brasil' }] },
    outcome: 'conflict',
    points: -1,
    why: 'the same street line in different countries',
  },
  {
    local: { address: [{ postalCode: '80010-000' }] },
    incoming: { address: [{ postalCode: '62701' }] },
    outcome: 'conflict',
    points: -1,
    why: 'a CEP and a ZIP are in different countries',
  },
  {
    local: {
      address: [
        { line: ['Rua A 10'], postalCode: '01310-100' },
        { line: ['Rua das Flores 100'], postalCode: '80010-000' },
      ],
    },
    incoming: { address: [{ line: ['Rua das Flores 100'], postalCode: '80010-000' }] },
    outcome: 'exact',
    points: 3,
    why: 'every address pair is tried: an old address does not hide the current one',
  },
  {
    local: { address: [{ city: 'Curitiba' }, { postalCode: '80010-000' }] },
    incoming: { address: [{ postalCode: '01310-100' }] },
    outcome: 'conflict',
    points: -1,
    why: 'a pair with nothing comparable does not hide a conflict',
  },
]);

table('gender', [
  {
    local: { gender: 'male' },
    incoming: { gender: 'male' },
    outcome: 'exact',
    points: 0,
    why: 'gender does not score by default',
  },
  {
    local: { gender: 'male' },
    incoming: { gender: 'female' },
    outcome: 'conflict',
    points: 0,
    why: 'a gender difference costs nothing by default',
  },
  {
    local: { gender: 'unknown' },
    incoming: { gender: 'female' },
    outcome: 'missing',
    points: 0,
    why: '"unknown" is missing',
  },
]);

describe('isGenderedPair', () => {
  it.each([
    ['paulo', 'paula', true, 'o and a'],
    ['alexandre', 'alexandra', true, 'e and a'],
    ['daniel', 'daniela', true, 'a added'],
    ['paul', 'paula', true, 'a added (English)'],
    ['victor', 'victoria', true, 'ia added'],
    ['daniela', 'daniel', true, 'either order'],
    ['gabriela', 'grabiela', false, 'a typo, not a gender ending'],
    ['ana', 'anna', false, 'a doubled letter'],
    ['maria', 'marta', false, 'a different name'],
    ['rafael', 'raquel', false, 'two different names'],
    ['mario', 'marie', false, 'o and e is not a masculine/feminine pair'],
    ['jo', 'ja', false, 'too short to tell'],
    ['al', 'ala', false, 'too short to tell (a added)'],
  ] as ReadonlyArray<readonly [string, string, boolean, string]>)(
    '%s / %s: %s (%s)',
    (a, b, expected) => {
      expect(isGenderedPair(a, b)).toBe(expected);
    },
  );
});

describe('name pairs', () => {
  it('takes given, family and middle from the same name pair, never mixed', () => {
    // Pair 1: given exact, family conflict. Pair 2: given conflict, family exact. Mixing the best
    // of each would report both as exact.
    const { fields } = compareFields(
      patient({ name: [n(['Ana'], 'Pereira'), n(['Carla'], 'Souza')] }),
      patient({ name: [n(['Ana'], 'Souza')] }),
    );
    const outcomes = fields.filter((r) => r.field === 'given' || r.field === 'family');
    expect(outcomes.map((r) => r.outcome).sort()).toEqual(['conflict', 'exact']);
  });

  it.each([
    ['Jr.', 'Sr.', true, 'father and son'],
    ['Filho', 'Neto', true, 'son and grandson'],
    ['Júnior', 'Neto', true, 'son and grandson'],
    ['II', 'III', true, 'different numerals'],
    ['Júnior', 'Filho', false, 'both mark a son with the father’s name (same generation)'],
    ['Jr.', 'Jr.', false, 'the same suffix'],
    ['Jr.', undefined, false, 'a suffix on one side only'],
  ] as ReadonlyArray<readonly [string, string | undefined, boolean, string]>)(
    'suffixes %s / %s conflict: %s (%s)',
    (a, b, conflict) => {
      const named = (suffix: string | undefined) =>
        patient({
          name: [
            {
              given: ['José'],
              family: 'Souza',
              ...(suffix === undefined ? {} : { suffix: [suffix] }),
            },
          ],
        });
      expect(compareFields(named(a), named(b)).suffixConflict).toBe(conflict);
    },
  );

  it('on a tie in points, prefers the name pair whose suffixes conflict (order-independent)', () => {
    // Both pairs score the same; only one of them carries different generations.
    const local = patient({
      // The pair without a conflict comes first, so input order alone would pick it.
      name: [
        { given: ['José'], family: 'Souza' },
        { given: ['José'], family: 'Souza', suffix: ['Jr.'] },
      ],
    });
    const incoming = patient({ name: [{ given: ['José'], family: 'Souza', suffix: ['Sr.'] }] });
    expect(compareFields(local, incoming).suffixConflict).toBe(true);
    expect(compareFields(incoming, local).suffixConflict).toBe(true);
  });

  it('reports the Jaro-Winkler similarity of a fuzzy name', () => {
    const r = result('given', { name: [n(['Gabriela'])] }, { name: [n(['Grabiela'])] });
    expect(r.similarity).toBeCloseTo(0.9625, 4);
  });
});

describe('bounded work (the incoming record is untrusted)', () => {
  const names = (count: number, last: HumanNameLike) => [
    ...Array.from({ length: count }, (_, i) => n([`Pessoa${i}`], `Familia${i}`)),
    last,
  ];

  it('compares at most 10 distinct names per side', () => {
    const tenth = result(
      'given',
      { name: names(9, n(['Ana'], 'Souza')) },
      { name: [n(['Ana'], 'Souza')] },
    );
    const eleventh = result(
      'given',
      { name: names(10, n(['Ana'], 'Souza')) },
      { name: [n(['Ana'], 'Souza')] },
    );
    expect([tenth.outcome, eleventh.outcome]).toEqual(['exact', 'conflict']);
  });

  it('counts duplicate names once, so they do not use up the limit', () => {
    const duplicates = Array.from({ length: 20 }, () => n(['Carla'], 'Pereira'));
    const r = result(
      'given',
      { name: [...duplicates, n(['Ana'], 'Souza')] },
      { name: [n(['Ana'], 'Souza')] },
    );
    expect(r.outcome).toBe('exact');
  });

  it('compares at most 10 distinct addresses per side', () => {
    const others = Array.from({ length: 10 }, (_, i) => ({
      line: [`Rua ${i}`],
      postalCode: '01310-100',
    }));
    const target = { line: ['Rua das Flores 100'], postalCode: '80010-000' };
    const r = result('address', { address: [...others, target] }, { address: [target] });
    expect(r.outcome).toBe('conflict');
  });

  it('runs Jaro-Winkler on the first 10 tokens of a name part only; equality uses all', () => {
    const family = Array.from({ length: 10 }, (_, i) => `Familia${i}`).join(' ');
    const typo = result(
      'family',
      { name: [n(['Ana'], `${family} Oliveira`)] },
      { name: [n(['Ana'], 'Olivera')] },
    );
    const equal = result(
      'family',
      { name: [n(['Ana'], `${family} Oliveira`)] },
      { name: [n(['Ana'], 'Oliveira')] },
    );
    expect([typo.outcome, equal.outcome]).toEqual(['conflict', 'exact']);
  });

  // Each of these was quadratic or worse before the limits (0.7 s to 11 s); now milliseconds.
  it('handles huge arrays in bounded time', { timeout: 5000 }, () => {
    const many = Array.from({ length: 100_000 }, (_, i) => n(['Ana'], `Souza${i}`));
    const emails = (k: string) =>
      Array.from({ length: 30_000 }, (_, i) => email(`${k}${i}@example.com`));
    const family = Array.from({ length: 5_000 }, (_, i) => `sobrenome${i}`).join(' ');
    compareFields(patient({ name: many }), patient({ name: many }));
    compareFields(patient({ telecom: emails('a') }), patient({ telecom: emails('b') }));
    compareFields(
      patient({ name: [n(['Ana'], family)] }),
      patient({ name: [n(['Ana'], family.replaceAll('sobrenome', 'nomesobre'))] }),
    );
  });
});

describe('weights', () => {
  it('merges overrides over the defaults, outcome by outcome', () => {
    const options: MatchOptions = { weights: { phone: { conflict: -2, exact: undefined } } };
    const differ = result(
      'phone',
      { telecom: [phone('(11) 98765-4321')] },
      { telecom: [phone('(21) 97654-3210')] },
      options,
    );
    const same = result(
      'phone',
      { telecom: [phone('(11) 98765-4321')] },
      { telecom: [phone('(11) 98765-4321')] },
      options,
    );
    expect([differ.points, same.points]).toEqual([-2, 4]);
  });
});

describe('results', () => {
  const full: Fields = {
    identifier: [cpf('111.444.777-35')],
    name: [n(['João', 'Pedro'], 'Souza')],
    birthDate: '1987-03-14',
    gender: 'male',
    telecom: [phone('(41) 99876-5432'), email('joao.souza@example.com')],
    address: [{ line: ['Rua das Flores 100'], postalCode: '80010-000' }],
  };
  const other: Fields = {
    identifier: [cpf('333.444.555-08')],
    name: [n(['Carla', 'Maria'], 'Pereira')],
    birthDate: '1962-08-19',
    gender: 'female',
    telecom: [phone('(21) 97654-3210'), email('carla.pereira@example.com')],
    address: [{ line: ['Avenida Central 50'], postalCode: '01310-100' }],
  };

  it('has one result per field, in MatchField order', () => {
    expect(compareFields(patient(full), patient(other)).fields.map((r) => r.field)).toEqual([
      'identifier',
      'family',
      'given',
      'middle',
      'birthDate',
      'phone',
      'email',
      'address',
      'gender',
    ]);
  });

  it('contains no patient values by default', () => {
    const values = [
      'joao',
      'pedro',
      'souza',
      'carla',
      'maria',
      'pereira',
      '1987',
      '1962',
      'male',
      '9876',
      '7654',
      'example.com',
      'flores',
      'central',
      '80010',
      '01310',
      '11144477735',
      '33344455508',
    ];
    for (const [a, b] of [
      [full, other],
      [full, full],
    ] as const) {
      const text = JSON.stringify(compareFields(patient(a), patient(b)).fields).toLowerCase();
      for (const value of values) expect(text).not.toContain(value);
    }
  });

  it('adds normalized values only with includeValues', () => {
    const fields = compareFields(patient(full), patient(other), { includeValues: true }).fields;
    const given = fields.find((r) => r.field === 'given');
    expect([given?.local, given?.incoming]).toEqual(['joao', 'carla']);
    const id = fields.find((r) => r.field === 'identifier');
    expect(id?.local).toBe(`${RNDS_CPF_SYSTEM}|11144477735`);
  });

  it('never mutates its inputs', () => {
    const deepFreeze = <T>(value: T): T => {
      if (typeof value === 'object' && value !== null) {
        for (const child of Object.values(value)) deepFreeze(child);
        Object.freeze(value);
      }
      return value;
    };
    const a = deepFreeze(patient(structuredClone(full)));
    const b = deepFreeze(patient(structuredClone(other)));
    expect(() => compareFields(a, b, { includeValues: true })).not.toThrow();
  });
});
