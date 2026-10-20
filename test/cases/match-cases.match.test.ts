// Runs matchPatients over the hard-case table. The expected answers were written in session 5,
// before any matching code; they are never edited to make a case pass.
//
// A case the current weights cannot reach is listed below with the session that will deal with
// it. `it.fails` keeps CI green while it fails and turns red once it passes, so the list cannot
// go stale.

import { describe, expect, it } from 'vitest';
import { matchPatients } from '../../src/index.js';
import { type MatchCase, matchCases } from './match-cases.js';

/** Case id -> why it fails today. Session 9 calibrates or documents each as a known limitation. */
const PENDING_CALIBRATION: ReadonlyMap<string, string> = new Map([
  ['name-only', 'given + family exact is 8 points, exactly the possible threshold'],
]);

const expectedDecisions = (c: MatchCase) =>
  typeof c.expected === 'string' ? [c.expected] : c.expected;

function check(c: MatchCase) {
  const result = matchPatients(c.local, c.incoming, c.options);
  expect(
    expectedDecisions(c),
    `${c.id}: got ${result.decision} (${result.points} points)`,
  ).toContain(result.decision);
  expect(result.vetoes.map((v) => v.code)).toEqual(expect.arrayContaining([...(c.vetoes ?? [])]));
}

describe('hard-case table: matchPatients', () => {
  for (const c of matchCases) {
    const pending = PENDING_CALIBRATION.get(c.id);
    if (pending === undefined) {
      it(`${c.id}: ${c.why}`, () => check(c));
    } else {
      it.fails(`${c.id} (pending calibration: ${pending})`, () => check(c));
    }
  }

  it('lists only existing cases as pending', () => {
    const ids = new Set(matchCases.map((c) => c.id));
    for (const id of PENDING_CALIBRATION.keys()) expect(ids).toContain(id);
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
