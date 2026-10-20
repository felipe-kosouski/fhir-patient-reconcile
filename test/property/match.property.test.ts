// Properties of matchPatients as a whole: determinism, no mutation, no patient values in
// explanations, and robustness on untrusted JSON. Symmetry and decision consistency live in
// compare.property.test.ts.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type MatchOptions,
  type MatchResult,
  matchPatients,
  type PatientLike,
  RNDS_CPF_SYSTEM,
} from '../../src/index.js';
import { options, patient, untrusted } from './arbitraries.js';

const anyPatient = fc.oneof(patient, untrusted);

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

describe('matchPatients: determinism', () => {
  it('the same inputs always give the same result, whatever object holds them', () => {
    fc.assert(
      fc.property(anyPatient, anyPatient, options, fc.boolean(), (a, b, opts, includeValues) => {
        const first = matchPatients(a, b, { ...opts, includeValues });
        expect(matchPatients(a, b, { ...opts, includeValues })).toEqual(first);
        // Fresh copies: no dependence on object identity or on earlier calls.
        const copies = structuredClone({ a, b, opts });
        expect(matchPatients(copies.a, copies.b, { ...copies.opts, includeValues })).toEqual(first);
      }),
    );
  });
});

describe('matchPatients: no mutation', () => {
  it('never writes to the patients or the options, with or without values', () => {
    fc.assert(
      fc.property(anyPatient, anyPatient, options, (a, b, opts) => {
        const before = structuredClone({ a, b, opts });
        // Frozen inputs throw on any write in strict mode (ES modules are strict).
        deepFreeze({ a, b, opts });
        matchPatients(a, b, opts);
        matchPatients(a, b, { ...opts, includeValues: true });
        expect({ a, b, opts }).toEqual(before);
      }),
    );
  });

  it('returns no object shared with its inputs or the defaults', () => {
    const p: PatientLike = { resourceType: 'Patient', name: [{ given: ['Ana'] }] };
    const thresholds = { match: 15, possible: 9 };
    const r = matchPatients(p, p, { thresholds });
    expect(r.thresholds).toEqual(thresholds);
    expect(r.thresholds).not.toBe(thresholds);
    r.thresholds.match = 99; // the result is the caller's to change
    expect(matchPatients(p, p, { thresholds }).thresholds.match).toBe(15);
  });
});

describe('matchPatients: no patient values in explanations', () => {
  // Free text carries a marker no explanation could contain by chance; numbers (phones, CPFs,
  // dates) are covered by asserting that explanations contain no digits at all.
  const MARKER = 'zqx';
  const marked = fc.constantFrom('Zqxana', 'Zqxbia', 'Zqxdaniel', 'Zqxdaniela', 'Zqxanna');
  const markedPatient = fc
    .record(
      {
        name: fc.array(
          fc.oneof(
            fc.record(
              {
                given: fc.array(marked, { maxLength: 3 }),
                family: fc.constantFrom('Zqxsouza', 'Zqxsousa', 'Zqxsouza Zqxsilva Filho'),
              },
              { requiredKeys: [] },
            ),
            fc.record({ text: fc.constantFrom('Zqxjoao Zqxpedro Zqxsouza', 'Zqxmaria') }),
          ),
          { maxLength: 2 },
        ),
        birthDate: fc.constantFrom('1987-03-14', '1987-04-03', '1987', '2001-09-23'),
        telecom: fc.array(
          fc.oneof(
            fc.record({
              system: fc.constant('phone'),
              value: fc.constantFrom('(41) 99876-5432', '(21) 97654-3210'),
            }),
            fc.record({
              system: fc.constant('email'),
              value: fc.constantFrom('zqx1@example.com', 'zqx2@example.com'),
            }),
          ),
          { maxLength: 2 },
        ),
        identifier: fc.array(
          fc.record({
            system: fc.constant(RNDS_CPF_SYSTEM),
            value: fc.constantFrom('111.444.777-35', '333.444.555-08'),
          }),
          { maxLength: 1 },
        ),
        address: fc.array(
          fc.record({
            line: fc.constantFrom(['Rua Zqxflores 100'], ['Rua Zqxpalmeiras 7']),
            city: fc.constant('Zqxcuritiba'),
            postalCode: fc.constantFrom('80010-000', '01310-100'),
          }),
          { maxLength: 1 },
        ),
        gender: fc.constantFrom('male', 'female'),
      },
      { requiredKeys: [] },
    )
    .map((fields) => ({ resourceType: 'Patient', ...fields }) as PatientLike);

  /** Every human-readable string in a result, with the trusted systems an identifier names. */
  function explanations(r: MatchResult): { texts: string[]; systems: string[] } {
    const raw = [...r.fields.map((f) => f.reason), ...r.vetoes.map((v) => v.reason)];
    const systems = raw.flatMap((t) => /\(system: ([^)]*)\)/.exec(t)?.[1]?.split(', ') ?? []);
    return { texts: raw.map((t) => t.replace(/\(system: [^)]*\)/, '')), systems };
  }

  it('explanations hold no patient text, no digits, and only configured systems', () => {
    const trusted = [RNDS_CPF_SYSTEM];
    fc.assert(
      fc.property(fc.oneof(markedPatient, patient), markedPatient, options, (a, b, opts) => {
        const r = matchPatients(a, b, { ...opts, identifierSystems: { trusted } });
        expect(JSON.stringify(r).toLowerCase()).not.toContain(MARKER);
        const { texts, systems } = explanations(r);
        for (const text of texts) expect(text).not.toMatch(/\d/);
        for (const system of systems) expect(trusted).toContain(system);
        for (const f of r.fields) {
          expect(f).not.toHaveProperty('local');
          expect(f).not.toHaveProperty('incoming');
        }
      }),
    );
  });

  it('includeValues is the only way values appear (the marker shows up with it)', () => {
    const p = (given: string): PatientLike => ({
      resourceType: 'Patient',
      name: [{ given: [given], family: 'Zqxsouza' }],
    });
    const options: MatchOptions = { includeValues: true };
    expect(JSON.stringify(matchPatients(p('Zqxana'), p('Zqxbia'), options))).toContain(MARKER);
  });
});

describe('matchPatients on untrusted JSON', () => {
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
