// Checks the hard-case table itself, not the matcher: unique ids, a reason for every case, and
// test data that is synthetic and parses the way each case assumes. A case must fail on its
// expected decision, never because one of its inputs was silently unusable.

import { describe, expect, it } from 'vitest';
import {
  normalizeBirthDate,
  normalizeCpf,
  normalizeEmail,
  normalizePhone,
  type PatientLike,
  RNDS_CPF_SYSTEM,
} from '../../src/index.js';
import { type MatchCase, matchCases } from './match-cases.js';

/** Cases whose identifiers, phones and emails are placeholders on purpose. */
const usesPlaceholders = (c: MatchCase) => c.id.startsWith('placeholders-');
const sides = (c: MatchCase): PatientLike[] => [c.local, c.incoming];

describe('hard-case table', () => {
  it('has unique ids and a one-line reason for every case', () => {
    const ids = matchCases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of matchCases) {
      expect(c.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(c.why.length).toBeGreaterThan(10);
      expect(c.why).not.toContain('\n');
    }
  });

  it.each(matchCases)('$id: data is synthetic and usable', (c) => {
    for (const p of sides(c)) {
      if (p.birthDate !== undefined) expect(normalizeBirthDate(p.birthDate)).toBeDefined();

      for (const t of p.telecom ?? []) {
        const value = t.value ?? '';
        if (t.system === 'email') {
          expect(value.trim().toLowerCase()).toMatch(/@example\.com$/);
          if (!usesPlaceholders(c)) expect(normalizeEmail(value)).toBeDefined();
        }
        if (t.system === 'phone') {
          const parsed = normalizePhone(value, { defaultCountry: c.options?.defaultCountry });
          if (usesPlaceholders(c)) continue;
          expect(parsed, `${value} must parse with the case options`).toBeDefined();
          // NANP numbers must come from the range reserved for fiction.
          if (parsed?.e164.startsWith('+1')) expect(parsed.e164).toMatch(/^\+1\d{3}55501\d\d$/);
        }
      }

      for (const id of p.identifier ?? []) {
        if (id.system === RNDS_CPF_SYSTEM && !usesPlaceholders(c)) {
          expect(normalizeCpf(id.value ?? '')).toBeDefined();
        }
      }
    }
  });
});
