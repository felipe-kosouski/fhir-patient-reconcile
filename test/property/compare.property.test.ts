import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { matchPatients, type PatientLike, RNDS_CPF_SYSTEM } from '../../src/index.js';
import { compareFields } from '../../src/match/compare/index.js';

// Small pools of synthetic values, so equal, near and different values all come up often.
const given = fc.constantFrom(
  'João',
  'Joao',
  'Ana',
  'Gabriela',
  'Grabiela',
  'Lucas',
  'RN de Maria',
  'J.',
);
const family = fc.constantFrom(
  'Souza',
  'da Silva Souza',
  'Silva',
  'Oliveira',
  'Olivera',
  'Souza Filho',
  'Souza Neto',
);
const humanName = fc.oneof(
  fc.record(
    {
      given: fc.array(given, { maxLength: 3 }),
      family,
      suffix: fc.constantFrom(['Jr.'], ['Sr.'], ['Júnior'], ['Filho'], ['Neto']),
    },
    { requiredKeys: ['given'] },
  ),
  fc.record({ text: fc.constantFrom('João Pedro Souza', 'Ana Silva Souza', 'Maria') }),
);
const birthDate = fc.constantFrom(
  '1987-03-14',
  '1987-03-04',
  '1987-04-03',
  '1987-03-13',
  '1981-03-14',
  '1987',
  '1987-03',
  '1962-08-19',
  '1900-01-01',
);
const contact = fc.oneof(
  fc.record({
    system: fc.constantFrom('phone', 'sms', 'fax'),
    value: fc.constantFrom(
      '(41) 99876-5432',
      '+55 41 99876 5432',
      '(41) 9876-5432',
      '(21) 97654-3210',
      '(41) 99999-9999',
    ),
  }),
  fc.record({
    system: fc.constant('email'),
    value: fc.constantFrom(
      'ana@example.com',
      'ANA@example.com',
      'carla@example.com',
      'noemail@example.com',
    ),
  }),
);
const identifier = fc.record({
  system: fc.constantFrom(RNDS_CPF_SYSTEM, 'urn:example:clinic-a:mrn'),
  value: fc.constantFrom(
    '111.444.777-35',
    '11144477735',
    '333.444.555-08',
    '000.000.000-00',
    'A-1',
  ),
});
const address = fc.record(
  {
    line: fc.constantFrom(['Rua das Flores 100'], ['R. das Flores, nº 100'], ['Rua A 10']),
    postalCode: fc.constantFrom('80010-000', '01310-100', '62701'),
    city: fc.constant('Curitiba'),
  },
  { requiredKeys: [] },
);
const patient: fc.Arbitrary<PatientLike> = fc
  .record(
    {
      name: fc.array(humanName, { maxLength: 3 }),
      birthDate,
      telecom: fc.array(contact, { maxLength: 3 }),
      identifier: fc.array(identifier, { maxLength: 2 }),
      address: fc.array(address, { maxLength: 2 }),
      gender: fc.constantFrom('male', 'female', 'unknown'),
    },
    { requiredKeys: [] },
  )
  .map((fields) => ({ resourceType: 'Patient', ...fields }) as PatientLike);
const options = fc.record(
  {
    defaultCountry: fc.constantFrom('BR', 'US'),
    identifierSystems: fc.constant({ trusted: [RNDS_CPF_SYSTEM, 'urn:example:clinic-a:mrn'] }),
  },
  { requiredKeys: [] },
);

const NAME_FIELDS = new Set(['given', 'family', 'middle']);

describe('compareFields', () => {
  it('is symmetric: swapping the patients gives the same outcomes and points', () => {
    fc.assert(
      fc.property(patient, patient, options, (a, b, opts) => {
        const ab = compareFields(a, b, opts).fields;
        const ba = compareFields(b, a, opts).fields;
        // Name results come from the best name pair; on a tie in points another pair may be
        // chosen, so only their total is compared.
        const namePoints = (fields: typeof ab) =>
          fields.filter((r) => NAME_FIELDS.has(r.field)).reduce((sum, r) => sum + r.points, 0);
        expect(namePoints(ba)).toBe(namePoints(ab));
        const others = (fields: typeof ab) =>
          fields
            .filter((r) => !NAME_FIELDS.has(r.field))
            .map(({ field, outcome, points }) => ({ field, outcome, points }));
        expect(others(ba)).toEqual(others(ab));
      }),
    );
  });

  it('includeValues changes only the values, never outcomes, points or reasons', () => {
    fc.assert(
      fc.property(patient, patient, options, (a, b, opts) => {
        const plain = compareFields(a, b, opts).fields;
        const strip = compareFields(a, b, { ...opts, includeValues: true }).fields.map(
          ({ local: _l, incoming: _i, ...rest }) => rest,
        );
        expect(strip).toEqual(plain);
        for (const r of plain) expect(r).not.toHaveProperty('local');
      }),
    );
  });

  it('a patient compared with itself never conflicts', () => {
    fc.assert(
      fc.property(patient, options, (a, opts) => {
        for (const r of compareFields(a, a, opts).fields) {
          // A patient with several names or addresses may still pair two different ones, so only
          // single-valued records are checked.
          if (r.field === 'address' && (a.address?.length ?? 0) > 1) continue;
          if (NAME_FIELDS.has(r.field) && (a.name?.length ?? 0) > 1) continue;
          expect(r.outcome, r.field).not.toBe('conflict');
        }
      }),
    );
  });
});

describe('matchPatients', () => {
  it('is symmetric: decision, points, grade, score, evidence and vetoes', () => {
    fc.assert(
      fc.property(patient, patient, options, (a, b, opts) => {
        const summary = (r: ReturnType<typeof matchPatients>) => ({
          decision: r.decision,
          points: r.points,
          matchGrade: r.matchGrade,
          score: r.score,
          insufficientEvidence: r.insufficientEvidence,
          vetoes: r.vetoes.map((v) => v.code).sort(),
        });
        expect(summary(matchPatients(b, a, opts))).toEqual(summary(matchPatients(a, b, opts)));
      }),
    );
  });

  it('the decision always follows from points, vetoes and evidence', () => {
    fc.assert(
      fc.property(patient, patient, options, (a, b, opts) => {
        const r = matchPatients(a, b, opts);
        const identifier = r.fields.find((f) => f.field === 'identifier')?.outcome;
        const vetoed = r.vetoes.length > 0;
        const points = r.fields.reduce((total, f) => total + f.points, 0);
        expect(r.points).toBeCloseTo(points, 9);
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1);
        if (r.decision === 'match') {
          expect(vetoed || r.insufficientEvidence).toBe(false);
          expect(r.points).toBeGreaterThanOrEqual(r.thresholds.match);
          expect(r.matchGrade).toBe('certain');
        }
        if (identifier === 'exact') expect(r.decision).not.toBe('no-match');
        if (vetoed && identifier !== 'exact') expect(r.decision).toBe('no-match');
        if (r.decision === 'no-match') expect(r.matchGrade).toBe(vetoed ? 'certainly-not' : null);
        if (r.decision === 'possible') {
          expect(['probable', 'possible']).toContain(r.matchGrade);
          const beyondName = ['birthDate', 'identifier', 'phone', 'email', 'address'];
          const agreeing = r.fields.filter(
            (f) => beyondName.includes(f.field) && (f.outcome === 'exact' || f.outcome === 'fuzzy'),
          );
          expect(agreeing.length).toBeGreaterThan(0);
        }
      }),
    );
  });
});

describe('matchPatients on untrusted JSON', () => {
  // Records come from outside as JSON. Any field may hold null, a number, an object or an array
  // where a string is expected; null is even legal inside arrays of primitives in FHIR JSON.
  const junk = fc.jsonValue({ maxDepth: 2 });
  const loose = <T>(valid: fc.Arbitrary<T>) => fc.oneof(valid, junk);
  const looseList = <T>(item: fc.Arbitrary<T>) =>
    loose(fc.array(fc.oneof(item, junk), { maxLength: 3 }));
  const looseName = fc.record(
    {
      given: looseList(given),
      family: loose(family),
      text: loose(fc.constant('João Pedro Souza')),
      suffix: looseList(fc.constantFrom('Jr.', 'Filho')),
    },
    { requiredKeys: [] },
  );
  const looseContact = fc.record(
    {
      system: loose(fc.constantFrom('phone', 'email')),
      value: loose(fc.constant('(41) 99876-5432')),
    },
    { requiredKeys: [] },
  );
  const looseAddress = fc.record(
    {
      line: looseList(fc.constant('Rua das Flores 100')),
      city: junk,
      postalCode: loose(fc.constant('80010-000')),
      country: junk,
    },
    { requiredKeys: [] },
  );
  const untrusted = fc
    .record(
      {
        name: looseList(looseName),
        telecom: looseList(looseContact),
        address: looseList(looseAddress),
        identifier: looseList(
          fc.record(
            { system: loose(fc.constant(RNDS_CPF_SYSTEM)), value: junk },
            { requiredKeys: [] },
          ),
        ),
        birthDate: loose(birthDate),
        gender: junk,
      },
      { requiredKeys: [] },
    )
    .map((fields) => ({ resourceType: 'Patient', ...fields }) as unknown as PatientLike);

  it('never throws, and the result stays well-formed', () => {
    fc.assert(
      fc.property(untrusted, untrusted, options, (a, b, opts) => {
        const r = matchPatients(a, b, { ...opts, includeValues: true });
        expect(['match', 'possible', 'no-match']).toContain(r.decision);
        expect(Number.isFinite(r.points)).toBe(true);
        expect(r.fields).toHaveLength(9);
      }),
    );
  });
});
