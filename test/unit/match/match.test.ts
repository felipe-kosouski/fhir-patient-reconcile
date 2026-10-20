import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THRESHOLDS,
  DEFAULT_WEIGHTS,
  type MatchOptions,
  matchPatients,
  type PatientLike,
  RNDS_CPF_SYSTEM,
} from '../../../src/index.js';

// Synthetic data only: invented names, example.com emails, patterned Brazilian numbers and CPFs
// built with the check-digit rule.

type Fields = Omit<PatientLike, 'resourceType'>;
const patient = (fields: Fields): PatientLike => ({ resourceType: 'Patient', ...fields });
const cpf = (value: string) => ({ system: RNDS_CPF_SYSTEM, value });

const joao: Fields = {
  name: [{ given: ['João'], family: 'Souza' }],
  birthDate: '1987-03-14',
  telecom: [{ system: 'phone', value: '(41) 99876-5432' }],
};

describe('decision', () => {
  it('match: enough points, sufficient evidence, no veto', () => {
    const r = matchPatients(patient(joao), patient(joao));
    expect(r).toMatchObject({
      decision: 'match',
      matchGrade: 'certain',
      points: 17,
      vetoes: [],
      insufficientEvidence: false,
      thresholds: DEFAULT_THRESHOLDS,
    });
  });

  it('probable needs sufficient evidence and points at or above the midpoint (11)', () => {
    // Everything required agrees, just short of a match: first-name typo (+2), family (+4),
    // swapped day and month (+2), same mobile (+4) = 12.
    const close = (given: string, birthDate: string, family = 'Souza') =>
      patient({ ...joao, name: [{ given: [given], family }], birthDate });
    const probable = matchPatients(
      close('Gabriela', '1987-03-04'),
      close('Grabiela', '1987-04-03'),
    );
    expect([probable.decision, probable.matchGrade, probable.points]).toEqual([
      'possible',
      'probable',
      12,
    ]);
    // Same evidence, both names near spellings: 2 + 2 + 2 + 4 = 10, below the midpoint.
    const below = matchPatients(
      close('Gabriela', '1987-03-04', 'Oliveira'),
      close('Grabiela', '1987-04-03', 'Olivera'),
    );
    expect([below.decision, below.matchGrade, below.points]).toEqual(['possible', 'possible', 10]);
  });

  it('without sufficient evidence the grade is possible, however many points', () => {
    // FHIR: probable = "review may be required", possible = "review SHOULD be performed".
    // Name + date only: 13 points, nothing corroborates them.
    const nameAndDate = matchPatients(
      patient({ name: joao.name, birthDate: joao.birthDate }),
      patient({ name: joao.name, birthDate: joao.birthDate }),
    );
    expect([nameAndDate.points, nameAndDate.matchGrade]).toEqual([13, 'possible']);
    // Twins sharing a compound first name: 20 points, middle names conflict.
    const named = (given: string[]) => patient({ ...joao, name: [{ given, family: 'Souza' }] });
    const twins = matchPatients(named(['Maria', 'Clara']), named(['Maria', 'Eduarda']));
    expect([twins.decision, twins.matchGrade]).toEqual(['possible', 'possible']);
  });

  it('no-match without a veto has no FHIR grade ($match would not return it)', () => {
    const r = matchPatients(patient({ name: joao.name }), patient({ telecom: joao.telecom }));
    expect([r.decision, r.matchGrade]).toEqual(['no-match', null]);
  });

  it('a name alone is never possible, however many name parts agree', () => {
    // given 4 + family 4 + middle 1 = 9 points, above the possible threshold, gender equal too.
    const fields: Fields = {
      name: [{ given: ['Maria', 'Aparecida'], family: 'Silva' }],
      gender: 'female',
    };
    const r = matchPatients(patient(fields), patient(fields));
    expect([r.points, r.decision, r.matchGrade]).toEqual([9, 'no-match', null]);
  });

  it('a name plus one agreeing field beyond it can be possible', () => {
    const name = [{ given: ['Maria'], family: 'Silva' }];
    const telecom = [{ system: 'phone', value: '(11) 98765-4321' }];
    const r = matchPatients(patient({ name, telecom }), patient({ name, telecom }));
    expect([r.points, r.decision]).toEqual([12, 'possible']);
  });

  it('a middle-name conflict blocks match (twins share compound first names)', () => {
    const named = (given: string[]) => patient({ ...joao, name: [{ given, family: 'Souza' }] });
    const twins = matchPatients(named(['Maria', 'Clara']), named(['Maria', 'Eduarda']));
    expect([twins.decision, twins.insufficientEvidence]).toEqual(['possible', true]);
    // A missing or initial-only middle name still never blocks.
    expect(matchPatients(named(['Maria', 'Clara']), named(['Maria'])).decision).toBe('match');
    expect(matchPatients(named(['Maria', 'Clara']), named(['Maria', 'C.'])).decision).toBe('match');
  });

  it('enough points without a corroborating field is never a match', () => {
    // 21 points from name, date and a heavy name weight, but no identifier/phone/email/address.
    const r = matchPatients(
      patient({ name: joao.name, birthDate: joao.birthDate }),
      patient({ name: joao.name, birthDate: joao.birthDate }),
      { weights: { given: { exact: 12 } } },
    );
    expect([r.decision, r.insufficientEvidence]).toEqual(['possible', true]);
  });

  it('a family-name conflict is insufficient evidence even with enough points', () => {
    const r = matchPatients(
      patient({
        ...joao,
        telecom: [...(joao.telecom ?? []), { system: 'email', value: 'j@example.com' }],
      }),
      patient({
        ...joao,
        name: [{ given: ['João'], family: 'Oliveira' }],
        telecom: [...(joao.telecom ?? []), { system: 'email', value: 'j@example.com' }],
      }),
    );
    expect([r.points, r.decision, r.insufficientEvidence]).toEqual([14, 'possible', true]);
  });
});

describe('vetoes', () => {
  it('two different trusted identifiers', () => {
    const r = matchPatients(
      patient({ ...joao, identifier: [cpf('111.444.777-35')] }),
      patient({ ...joao, identifier: [cpf('333.444.555-08')] }),
    );
    expect([r.decision, r.matchGrade, r.vetoes.map((v) => v.code)]).toEqual([
      'no-match',
      'certainly-not',
      ['identifier-conflict'],
    ]);
  });

  it('generational suffixes of different generations', () => {
    const r = matchPatients(
      patient({ ...joao, name: [{ given: ['João'], family: 'Souza Filho' }] }),
      patient({ ...joao, name: [{ given: ['João'], family: 'Souza Neto' }] }),
    );
    expect(r.vetoes.map((v) => v.code)).toEqual(['generational-suffix-conflict']);
    expect(r.decision).toBe('no-match');
  });

  it('Júnior and Filho are the same generation: no veto', () => {
    const r = matchPatients(
      patient({ ...joao, name: [{ given: ['João'], family: 'Souza Júnior' }] }),
      patient({ ...joao, name: [{ given: ['João'], family: 'Souza Filho' }] }),
    );
    expect([r.vetoes, r.decision]).toEqual([[], 'match']);
  });

  it('birth dates in different years', () => {
    const r = matchPatients(patient(joao), patient({ ...joao, birthDate: '2001-09-23' }));
    expect(r.vetoes.map((v) => v.code)).toEqual(['birthdate-conflict']);
  });

  it('a partial date in another year also vetoes', () => {
    const r = matchPatients(
      patient({ ...joao, birthDate: '1987' }),
      patient({ ...joao, birthDate: '1962-08-19' }),
    );
    expect(r.vetoes.map((v) => v.code)).toEqual(['birthdate-conflict']);
  });

  it('a conflict within the same year only costs points (it stays reviewable)', () => {
    const telecom = [...(joao.telecom ?? []), { system: 'email', value: 'joao@example.com' }];
    const r = matchPatients(
      patient({ ...joao, telecom }),
      patient({ ...joao, telecom, birthDate: '1987-08-14' }),
    );
    // given 4 + family 4 + birthDate -6 + phone 4 + email 4 = 10: possible, not vetoed.
    expect([r.vetoes, r.decision, r.points]).toEqual([[], 'possible', 10]);
  });

  it('a fuzzy year typo is not a veto', () => {
    const r = matchPatients(patient(joao), patient({ ...joao, birthDate: '1981-03-14' }));
    expect(r.vetoes).toEqual([]);
  });

  it('veto reasons contain no patient values', () => {
    const r = matchPatients(
      patient({
        ...joao,
        identifier: [cpf('111.444.777-35')],
        name: [{ given: ['João'], family: 'Souza', suffix: ['Jr.'] }],
      }),
      patient({
        ...joao,
        identifier: [cpf('333.444.555-08')],
        birthDate: '1962-08-19',
        name: [{ given: ['João'], family: 'Souza', suffix: ['Sr.'] }],
      }),
    );
    expect(r.vetoes).toHaveLength(3);
    const text = JSON.stringify(r).toLowerCase();
    for (const value of ['joao', 'souza', '1987', '1962', '11144477735', '33344455508', '9876']) {
      expect(text).not.toContain(value);
    }
  });
});

describe('an equal trusted identifier floors the decision at possible', () => {
  it('same CPF, completely different name (owner decision 4)', () => {
    const r = matchPatients(
      patient({
        name: [{ given: ['João'], family: 'Souza' }],
        identifier: [cpf('222.333.444-05')],
      }),
      patient({
        name: [{ given: ['Carla'], family: 'Pereira' }],
        identifier: [cpf('222.333.444-05')],
      }),
    );
    expect([r.points, r.decision, r.matchGrade]).toEqual([4, 'possible', 'possible']);
  });

  it('even when a veto fires: a shared CPF needs a human look', () => {
    const r = matchPatients(
      patient({ ...joao, identifier: [cpf('222.333.444-05')] }),
      patient({ ...joao, identifier: [cpf('222.333.444-05')], birthDate: '1962-08-19' }),
    );
    expect([r.decision, r.vetoes.map((v) => v.code)]).toEqual(['possible', ['birthdate-conflict']]);
  });

  it('a vetoed pair lifted to possible is graded possible, never probable', () => {
    // identifier 10 + family 4 + given 4 - birthDate 6 + phone 4 = 16 points, above the midpoint.
    const r = matchPatients(
      patient({ ...joao, identifier: [cpf('222.333.444-05')] }),
      patient({ ...joao, identifier: [cpf('222.333.444-05')], birthDate: '1962-08-19' }),
    );
    expect([r.points, r.decision, r.matchGrade]).toEqual([16, 'possible', 'possible']);
  });
});

describe('score', () => {
  const max = Object.values(DEFAULT_WEIGHTS).reduce((total, w) => total + w.exact, 0);

  it('is points over the most points the weights allow', () => {
    const r = matchPatients(patient(joao), patient(joao));
    expect(r.score).toBeCloseTo(17 / max, 10);
  });

  it('is 0 for negative points and never above 1', () => {
    const negative = matchPatients(
      patient({ name: joao.name, birthDate: '1987-03-14' }),
      patient({ name: [{ given: ['Carla'], family: 'Pereira' }], birthDate: '1962-08-19' }),
    );
    expect([negative.points < 0, negative.score]).toEqual([true, 0]);
    const heavyFuzzy = matchPatients(
      patient({ name: [{ given: ['Gabriela'], family: 'Souza' }] }),
      patient({ name: [{ given: ['Grabiela'], family: 'Souza' }] }),
      { weights: { given: { fuzzy: 1000 } } },
    );
    expect(heavyFuzzy.score).toBe(1);
  });
});

describe('options', () => {
  it('thresholds are merged over the defaults and reported', () => {
    const r = matchPatients(patient(joao), patient(joao), { thresholds: { match: 18 } });
    expect([r.decision, r.thresholds]).toEqual(['possible', { match: 18, possible: 8 }]);
  });

  it.each<[string, MatchOptions]>([
    ['a NaN weight', { weights: { phone: { exact: Number.NaN } } }],
    ['an infinite weight', { weights: { given: { conflict: Number.NEGATIVE_INFINITY } } }],
    ['a non-finite threshold', { thresholds: { match: Number.POSITIVE_INFINITY } }],
    ['possible above match', { thresholds: { match: 10, possible: 12 } }],
    ['fuzzyMin above 1', { nameSimilarity: { fuzzyMin: 1.5 } }],
    ['fuzzyMin below 0', { nameSimilarity: { fuzzyMin: -0.1 } }],
    ['a NaN fuzzyMin', { nameSimilarity: { fuzzyMin: Number.NaN } }],
  ])('rejects %s with a RangeError', (_, options) => {
    expect(() => matchPatients(patient(joao), patient(joao), options)).toThrow(RangeError);
  });

  // Untyped callers (JSON config, environment variables) bypass the types, so these are cast.
  const untyped = (options: object) => options as MatchOptions;

  it.each<[string, object]>([
    ['a misspelled field', { weights: { birthdate: { exact: 9 } } }],
    ['a misspelled outcome', { weights: { given: { exakt: 9 } } }],
    ['a misspelled threshold', { thresholds: { mtch: 9 } }],
    ['a misspelled top-level option', { defaultCountyr: 'BR' }],
    ['a misspelled nested option', { nameSimilarity: { fuzzymin: 0.9 } }],
    ['an unsupported defaultCountry', { defaultCountry: 'br' }],
    ['a string fuzzyMin', { nameSimilarity: { fuzzyMin: '0.9' } }],
  ])('rejects %s with a RangeError instead of ignoring it', (_, options) => {
    expect(() => matchPatients(patient(joao), patient(joao), untyped(options))).toThrow(RangeError);
  });

  it.each<[string, object]>([
    ['trusted systems given as a string', { identifierSystems: { trusted: 'urn:example:mrn' } }],
    ['a normalizePhone that is not a function', { normalizePhone: 'libphonenumber' }],
  ])('rejects %s with a TypeError, even when no field would use it', (_, options) => {
    expect(() => matchPatients(patient({}), patient({}), untyped(options))).toThrow(TypeError);
  });

  it('adds patient values only for includeValues === true (a truthy string must not leak PHI)', () => {
    for (const includeValues of ['false', 'true', 1]) {
      const r = matchPatients(patient(joao), patient(joao), untyped({ includeValues }));
      expect(r.fields.some((f) => 'local' in f || 'incoming' in f)).toBe(false);
    }
  });

  it('compares points with thresholds without floating-point drift (0.7 + 0.1 reaches 0.8)', () => {
    // The birth date agrees (possible needs evidence beyond the name) but is weighted 0.
    const fields = { name: [{ given: ['Ana'], family: 'Souza' }], birthDate: '1980-06-15' };
    const r = matchPatients(patient(fields), patient(fields), {
      weights: { given: { exact: 0.7 }, family: { exact: 0.1 }, birthDate: { exact: 0 } },
      thresholds: { match: 10, possible: 0.8 },
    });
    expect([r.points, r.decision]).toEqual([0.8, 'possible']);
  });

  it('the exported defaults are frozen, so one caller cannot change everyone’s results', () => {
    const weights = DEFAULT_WEIGHTS as { given: { exact: number } };
    expect(() => {
      weights.given.exact = 100;
    }).toThrow(TypeError);
    expect(() => {
      (DEFAULT_THRESHOLDS as { match: number }).match = 1;
    }).toThrow(TypeError);
    expect(matchPatients(patient(joao), patient(joao)).points).toBe(17);
  });

  it('accepts explicit undefined everywhere (exactOptionalPropertyTypes callers)', () => {
    const options: MatchOptions = {
      weights: { phone: { exact: undefined } },
      thresholds: { match: undefined, possible: undefined },
      nameSimilarity: { fuzzyMin: undefined },
      defaultCountry: undefined,
      includeValues: undefined,
    };
    expect(matchPatients(patient(joao), patient(joao), options).decision).toBe('match');
  });

  it('never mutates its inputs', () => {
    const a = patient(structuredClone(joao));
    const b = patient(structuredClone({ ...joao, birthDate: '1987-03-13' }));
    const before = structuredClone([a, b]);
    matchPatients(a, b, { includeValues: true });
    expect([a, b]).toEqual(before);
  });
});
