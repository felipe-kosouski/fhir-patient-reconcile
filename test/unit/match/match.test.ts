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

  it('possible at or above the midpoint is FHIR "probable", below it "possible"', () => {
    // Name + date only: 13 points, insufficient evidence (nothing corroborates them).
    const probable = matchPatients(
      patient({ name: joao.name, birthDate: joao.birthDate }),
      patient({ name: joao.name, birthDate: joao.birthDate }),
    );
    expect([probable.decision, probable.matchGrade, probable.points]).toEqual([
      'possible',
      'probable',
      13,
    ]);
    // Day and month swapped: 4 + 4 + 2 = 10, below the midpoint 11.
    const possible = matchPatients(
      patient({ name: joao.name, birthDate: '1987-03-04' }),
      patient({ name: joao.name, birthDate: '1987-04-03' }),
    );
    expect([possible.decision, possible.matchGrade, possible.points]).toEqual([
      'possible',
      'possible',
      10,
    ]);
  });

  it('no-match without a veto has no FHIR grade ($match would not return it)', () => {
    const r = matchPatients(patient({ name: joao.name }), patient({ telecom: joao.telecom }));
    expect([r.decision, r.matchGrade]).toEqual(['no-match', null]);
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
