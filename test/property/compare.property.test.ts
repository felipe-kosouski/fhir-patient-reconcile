import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { matchPatients } from '../../src/index.js';
import { compareFields } from '../../src/match/compare/index.js';
import { options, patient } from './arbitraries.js';

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
          if (vetoed || r.insufficientEvidence) expect(r.matchGrade).toBe('possible');
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
