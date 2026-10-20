// Runs matchPatients over the hard-case table. The expected answers are never edited to make a
// case pass; a case the matcher gets wrong is listed in known-limitations.ts and documented.

import { describe, expect, it } from 'vitest';
import { matchPatients } from '../../src/index.js';
import { KNOWN_LIMITATIONS } from './known-limitations.js';
import { type MatchCase, matchCases, meetsExpectation } from './match-cases.js';

function check(c: MatchCase) {
  const result = matchPatients(c.local, c.incoming, c.options);
  expect(
    meetsExpectation(c, result),
    `${c.id}: got ${result.decision} (${result.points} points), vetoes ${result.vetoes.map((v) => v.code).join(', ') || 'none'}`,
  ).toBe(true);
}

describe('hard-case table: matchPatients', () => {
  for (const c of matchCases) {
    const limitation = KNOWN_LIMITATIONS.get(c.id);
    if (limitation === undefined) {
      it(`${c.id}: ${c.why}`, () => check(c));
    } else {
      // Passes while the case fails; turns red once the matcher gets it right.
      it.fails(`${c.id} (known limitation)`, () => check(c));
    }
  }

  it('lists only existing cases as known limitations', () => {
    const ids = new Set(matchCases.map((c) => c.id));
    for (const id of KNOWN_LIMITATIONS.keys()) expect(ids).toContain(id);
  });

  it.each(matchCases)('$id: the same result with the patients swapped', (c) => {
    const ab = matchPatients(c.local, c.incoming, c.options);
    const ba = matchPatients(c.incoming, c.local, c.options);
    expect([ba.decision, ba.points, ba.matchGrade]).toEqual([
      ab.decision,
      ab.points,
      ab.matchGrade,
    ]);
  });
});
