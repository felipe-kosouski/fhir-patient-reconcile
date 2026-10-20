// Hard cases for matchPatients, written BEFORE any matching code or weight exists.
//
// Each case is the expected answer plus one sentence on why. When calibration cannot reach an
// expected answer, the case is marked as a known limitation and documented; the answer itself
// is never changed to make a test pass.
//
// All data is synthetic: invented names, example.com emails, US phones in 555-0100..0199,
// patterned Brazilian phones, and CPFs generated with the check-digit algorithm.

import {
  type ContactPointLike,
  type HumanNameLike,
  type IdentifierLike,
  type MatchResult,
  type PatientLike,
  type PhoneCountry,
  RNDS_CPF_SYSTEM,
} from '../../src/index.js';

export type ExpectedDecision = 'match' | 'possible' | 'no-match';
export type ExpectedVeto =
  | 'identifier-conflict'
  | 'generational-suffix-conflict'
  | 'birthdate-conflict';

export interface MatchCase {
  id: string;
  local: PatientLike;
  incoming: PatientLike;
  options?: { defaultCountry?: PhoneCountry };
  /**
   * The expected decision. A list means every listed decision is acceptable; it is used only
   * where the plan fixes a limit ("must not be match") rather than a value.
   */
  expected: ExpectedDecision | readonly ExpectedDecision[];
  /** Vetoes the result must contain (it may contain others). */
  vetoes?: readonly ExpectedVeto[];
  why: string;
}

/** The expected decision, and every expected veto among the result's vetoes. */
export function meetsExpectation(
  c: MatchCase,
  result: Pick<MatchResult, 'decision' | 'vetoes'>,
): boolean {
  const decisions: readonly ExpectedDecision[] =
    typeof c.expected === 'string' ? [c.expected] : c.expected;
  const codes = new Set(result.vetoes.map((v) => v.code));
  return decisions.includes(result.decision) && (c.vetoes ?? []).every((v) => codes.has(v));
}

// --- builders (keep the table readable) ---

type Fields = Omit<PatientLike, 'resourceType'>;
const patient = (fields: Fields): PatientLike => ({ resourceType: 'Patient', ...fields });
const name = (given: readonly string[], family: string, suffix?: string): HumanNameLike =>
  suffix === undefined ? { given, family } : { given, family, suffix: [suffix] };
const phone = (value: string): ContactPointLike => ({ system: 'phone', value });
const email = (value: string): ContactPointLike => ({ system: 'email', value });
const cpf = (value: string): IdentifierLike => ({ system: RNDS_CPF_SYSTEM, value });

// CPFs generated from patterned bodies with the published check-digit rule.
const CPF_1 = '111.444.777-35';
const CPF_2 = '222.333.444-05';
const CPF_3 = '333.444.555-08';

const BR = { defaultCountry: 'BR' } as const;
const US = { defaultCountry: 'US' } as const;

export const matchCases: readonly MatchCase[] = [
  // ---------- the same person, recorded differently ----------
  {
    id: 'same-person-all-fields',
    local: patient({
      name: [name(['João', 'Pedro'], 'Souza')],
      birthDate: '1987-03-14',
      identifier: [cpf(CPF_1)],
      telecom: [phone('(41) 99876-5432'), email('joao.souza@example.com')],
    }),
    incoming: patient({
      name: [name(['João', 'Pedro'], 'Souza')],
      birthDate: '1987-03-14',
      identifier: [cpf(CPF_1)],
      telecom: [phone('(41) 99876-5432'), email('joao.souza@example.com')],
    }),
    expected: 'match',
    why: 'every field agrees; anything else would make the library useless',
  },
  {
    id: 'formatting-only-differences',
    local: patient({
      name: [name(['João'], 'Souza')],
      birthDate: '1987-03-14',
      telecom: [phone('(41) 99876-5432'), email('joao.souza@example.com')],
    }),
    incoming: patient({
      name: [name(['JOAO'], 'SOUZA')],
      birthDate: '1987-03-14',
      telecom: [phone('+55 41 99876 5432'), email(' Joao.Souza@Example.COM ')],
    }),
    expected: 'match',
    why: 'case, accents, phone formatting and country code are not differences after normalization',
  },
  {
    id: 'middle-name-missing-on-one-side',
    local: patient({
      name: [name(['João', 'Pedro'], 'Souza')],
      birthDate: '1987-03-14',
      telecom: [phone('(41) 99876-5432')],
    }),
    incoming: patient({
      name: [name(['João'], 'Souza')],
      birthDate: '1987-03-14',
      telecom: [phone('(41) 99876-5432')],
    }),
    expected: 'match',
    why: 'middle names are often left out; a missing one is not a disagreement',
  },
  {
    id: 'particles-and-extra-family-name',
    local: patient({
      name: [name(['Maria'], 'da Silva Souza')],
      birthDate: '1990-07-21',
      telecom: [phone('(11) 98765-4321')],
    }),
    incoming: patient({
      name: [name(['Maria'], 'Souza')],
      birthDate: '1990-07-21',
      telecom: [phone('(11) 98765-4321')],
    }),
    expected: 'match',
    why: 'Brazilian records often keep only the last family name; "da" is not a name',
  },
  {
    id: 'family-names-reordered',
    local: patient({
      name: [name(['Ana'], 'Silva Souza')],
      birthDate: '1992-11-05',
      telecom: [phone('(21) 98765-4321')],
    }),
    incoming: patient({
      name: [name(['Ana'], 'Souza Silva')],
      birthDate: '1992-11-05',
      telecom: [phone('(21) 98765-4321')],
    }),
    expected: 'match',
    why: 'the same family names in another order are the same family names',
  },
  {
    id: 'name-only-in-text',
    local: patient({
      name: [name(['João', 'Pedro'], 'Souza')],
      birthDate: '1987-03-14',
      telecom: [phone('(41) 99876-5432')],
    }),
    incoming: patient({
      name: [{ text: 'João Pedro Souza' }],
      birthDate: '1987-03-14',
      telecom: [phone('(41) 99876-5432')],
    }),
    expected: 'match',
    why: 'some systems only fill HumanName.text; it carries the same name',
  },
  {
    id: 'given-name-typo',
    local: patient({
      name: [name(['Gabriela'], 'Souza')],
      birthDate: '1995-01-30',
      telecom: [phone('(41) 99876-5432')],
    }),
    incoming: patient({
      name: [name(['Grabiela'], 'Souza')],
      birthDate: '1995-01-30',
      telecom: [phone('(41) 99876-5432')],
    }),
    expected: 'match',
    why: 'a one-letter typo in the first name is the most common entry error',
  },
  {
    id: 'br-mobile-with-and-without-ninth-digit',
    local: patient({
      name: [name(['Ana'], 'Souza')],
      birthDate: '1980-06-15',
      telecom: [phone('(41) 9876-5432')],
    }),
    incoming: patient({
      name: [name(['Ana'], 'Souza')],
      birthDate: '1980-06-15',
      telecom: [phone('(41) 99876-5432')],
    }),
    options: BR,
    expected: 'match',
    why: 'Brazilian mobiles gained a leading 9 (2012-2016); old records still have 8 digits',
  },
  {
    id: 'us-phone-country-code-and-formatting',
    local: patient({
      name: [name(['Emily'], 'Carter')],
      birthDate: '1985-09-12',
      telecom: [phone('+1 (212) 555-0147')],
    }),
    incoming: patient({
      name: [name(['Emily'], 'Carter')],
      birthDate: '1985-09-12',
      telecom: [phone('212.555.0147')],
    }),
    options: US,
    expected: 'match',
    why: '+1 and punctuation are formatting; the number is the same',
  },
  {
    id: 'email-case',
    local: patient({
      name: [name(['Emily'], 'Carter')],
      birthDate: '1985-09-12',
      telecom: [email('Emily.Carter@Example.com')],
    }),
    incoming: patient({
      name: [name(['Emily'], 'Carter')],
      birthDate: '1985-09-12',
      telecom: [email('emily.carter@example.com')],
    }),
    expected: 'match',
    why: 'email case is not significant in practice',
  },
  {
    id: 'address-abbreviations',
    local: patient({
      name: [name(['Ana'], 'Souza')],
      birthDate: '1980-06-15',
      address: [{ line: ['R. das Flores, nº 100'], postalCode: '80010-000', country: 'BR' }],
    }),
    incoming: patient({
      name: [name(['Ana'], 'Souza')],
      birthDate: '1980-06-15',
      address: [{ line: ['Rua das Flores 100'], postalCode: '80010000' }],
    }),
    expected: 'match',
    why: 'same CEP and street; the address is the corroborating evidence besides name and date',
  },
  {
    id: 'gender-differs',
    local: patient({
      name: [name(['Alex'], 'Souza')],
      birthDate: '1993-04-22',
      gender: 'male',
      telecom: [phone('(41) 99876-5432'), email('alex.souza@example.com')],
    }),
    incoming: patient({
      name: [name(['Alex'], 'Souza')],
      birthDate: '1993-04-22',
      gender: 'female',
      telecom: [phone('(41) 99876-5432'), email('alex.souza@example.com')],
    }),
    expected: 'match',
    why: 'gender is not scored: it is miscoded often and it can change',
  },

  // ---------- birth date variations ----------
  {
    id: 'birthdate-day-month-swapped-with-contacts',
    local: patient({
      name: [name(['Ana'], 'Souza')],
      birthDate: '1987-03-04',
      telecom: [phone('(41) 99876-5432'), email('ana.souza@example.com')],
    }),
    incoming: patient({
      name: [name(['Ana'], 'Souza')],
      birthDate: '1987-04-03',
      telecom: [phone('(41) 99876-5432'), email('ana.souza@example.com')],
    }),
    expected: 'match',
    why: 'dd/mm vs mm/dd swaps are common; same name, mobile and email confirm the person',
  },
  {
    id: 'birthdate-day-month-swapped-name-only',
    local: patient({ name: [name(['Ana'], 'Souza')], birthDate: '1987-03-04' }),
    incoming: patient({ name: [name(['Ana'], 'Souza')], birthDate: '1987-04-03' }),
    expected: 'possible',
    why: 'a near date and a name are worth a look, but nothing else confirms them',
  },
  {
    id: 'birthdate-off-by-one-day',
    local: patient({
      name: [name(['Emily'], 'Carter')],
      birthDate: '1985-09-12',
      telecom: [phone('(212) 555-0147'), email('emily.carter@example.com')],
    }),
    incoming: patient({
      name: [name(['Emily'], 'Carter')],
      birthDate: '1985-09-13',
      telecom: [phone('(212) 555-0147'), email('emily.carter@example.com')],
    }),
    options: US,
    expected: 'match',
    why: 'one day off is a typical time-zone or entry error; contacts confirm the person',
  },
  {
    id: 'birthdate-one-year-digit',
    local: patient({
      name: [name(['João'], 'Souza')],
      birthDate: '1987-03-14',
      telecom: [phone('(41) 99876-5432'), email('joao.souza@example.com')],
    }),
    incoming: patient({
      name: [name(['João'], 'Souza')],
      birthDate: '1981-03-14',
      telecom: [phone('(41) 99876-5432'), email('joao.souza@example.com')],
    }),
    expected: 'match',
    why: 'one mistyped year digit with the same day, month, name and contacts is a typo',
  },
  {
    id: 'partial-birthdate-year-only',
    local: patient({
      name: [name(['João'], 'Souza')],
      birthDate: '1987',
      telecom: [phone('(41) 99876-5432')],
    }),
    incoming: patient({
      name: [name(['João'], 'Souza')],
      birthDate: '1987-03-14',
      telecom: [phone('(41) 99876-5432')],
    }),
    expected: 'possible',
    why: 'a year is consistent with the full date but cannot confirm it',
  },
  {
    id: 'partial-birthdate-conflict',
    local: patient({
      name: [name(['João'], 'Souza')],
      birthDate: '1987',
      telecom: [phone('(41) 99876-5432')],
    }),
    incoming: patient({
      name: [name(['João'], 'Souza')],
      birthDate: '1962-08-19',
      telecom: [phone('(41) 99876-5432')],
    }),
    expected: 'no-match',
    why: 'even at year precision the dates disagree by decades',
  },

  // ---------- family members: similar records, different people ----------
  {
    id: 'twins',
    local: patient({
      name: [name(['Lucas'], 'Souza')],
      birthDate: '2010-05-02',
      telecom: [phone('(41) 3456-7890')],
      address: [{ line: ['Rua das Flores 100'], postalCode: '80010-000', country: 'BR' }],
    }),
    incoming: patient({
      name: [name(['Mateus'], 'Souza')],
      birthDate: '2010-05-02',
      telecom: [phone('(41) 3456-7890')],
      address: [{ line: ['Rua das Flores 100'], postalCode: '80010-000', country: 'BR' }],
    }),
    options: BR,
    expected: ['possible', 'no-match'],
    why: 'twins share everything but the first name, and they must never be merged',
  },
  {
    // Added in the session 9 review: the only twins case above has unrelated first names.
    id: 'twins-boy-girl',
    local: patient({
      name: [name(['Daniel'], 'Souza')],
      birthDate: '2010-05-02',
      telecom: [phone('(41) 3456-7890')],
      address: [{ line: ['Rua das Flores 100'], postalCode: '80010-000', country: 'BR' }],
    }),
    incoming: patient({
      name: [name(['Daniela'], 'Souza')],
      birthDate: '2010-05-02',
      telecom: [phone('(41) 3456-7890')],
      address: [{ line: ['Rua das Flores 100'], postalCode: '80010-000', country: 'BR' }],
    }),
    options: BR,
    expected: ['possible', 'no-match'],
    why: 'boy/girl twins often get the masculine and feminine forms of one name (no gender recorded here)',
  },
  {
    id: 'junior-vs-senior',
    local: patient({
      name: [name(['Robert'], 'Miller', 'Jr.')],
      birthDate: '1990-05-02',
      telecom: [phone('(312) 555-0110')],
    }),
    incoming: patient({
      name: [name(['Robert'], 'Miller', 'Sr.')],
      birthDate: '1962-08-19',
      telecom: [phone('(312) 555-0110')],
    }),
    options: US,
    expected: 'no-match',
    vetoes: ['generational-suffix-conflict'],
    why: 'Jr. and Sr. are father and son at the same address',
  },
  {
    id: 'filho-vs-neto',
    local: patient({
      name: [name(['José'], 'Souza Filho')],
      birthDate: '1975-02-10',
      telecom: [phone('(41) 3456-7890')],
    }),
    incoming: patient({
      name: [name(['José'], 'Souza Neto')],
      birthDate: '2001-09-23',
      telecom: [phone('(41) 3456-7890')],
    }),
    options: BR,
    expected: 'no-match',
    vetoes: ['generational-suffix-conflict'],
    why: 'Filho (son) and Neto (grandson) are different generations',
  },
  {
    id: 'filho-missing-on-one-side',
    local: patient({
      name: [name(['José'], 'Souza Filho')],
      birthDate: '1975-02-10',
      telecom: [phone('(41) 99876-5432')],
    }),
    incoming: patient({
      name: [name(['José'], 'Souza')],
      birthDate: '1975-02-10',
      telecom: [phone('(41) 99876-5432')],
    }),
    expected: 'match',
    why: 'suffixes are often dropped; a suffix on one side only is not a conflict',
  },
  {
    id: 'father-and-son-without-suffix',
    local: patient({
      name: [name(['José'], 'Souza')],
      birthDate: '1975-02-10',
      telecom: [phone('(41) 3456-7890')],
      address: [{ line: ['Rua das Flores 100'], postalCode: '80010-000', country: 'BR' }],
    }),
    incoming: patient({
      name: [name(['José'], 'Souza')],
      birthDate: '2001-09-23',
      telecom: [phone('(41) 3456-7890')],
      address: [{ line: ['Rua das Flores 100'], postalCode: '80010-000', country: 'BR' }],
    }),
    options: BR,
    expected: 'no-match',
    vetoes: ['birthdate-conflict'],
    why: 'same name and home, decades apart: a parent and child whose suffix was never recorded',
  },
  {
    id: 'shared-family-landline',
    local: patient({
      name: [name(['Ana'], 'Souza')],
      birthDate: '1980-06-15',
      telecom: [phone('(41) 3456-7890')],
    }),
    incoming: patient({
      name: [name(['Carla'], 'Souza')],
      birthDate: '1983-12-01',
      telecom: [phone('(41) 3456-7890')],
    }),
    options: BR,
    expected: 'no-match',
    why: 'a home landline is shared by the family; it cannot carry a match on its own',
  },
  {
    id: 'married-surname-replaced',
    local: patient({
      name: [name(['Maria'], 'Souza')],
      birthDate: '1990-07-21',
      telecom: [phone('(11) 98765-4321'), email('maria.s@example.com')],
    }),
    incoming: patient({
      name: [name(['Maria'], 'Oliveira')],
      birthDate: '1990-07-21',
      telecom: [phone('(11) 98765-4321'), email('maria.s@example.com')],
    }),
    expected: 'possible',
    why: 'a changed family name after marriage looks like a conflict; a human must confirm it',
  },
  {
    id: 'married-surname-added',
    local: patient({
      name: [name(['Maria'], 'Souza')],
      birthDate: '1990-07-21',
      telecom: [phone('(11) 98765-4321')],
    }),
    incoming: patient({
      name: [name(['Maria'], 'Souza Oliveira')],
      birthDate: '1990-07-21',
      telecom: [phone('(11) 98765-4321')],
    }),
    expected: 'match',
    why: 'Brazilian married names usually add a family name; the original one is still there',
  },

  // ---------- identifiers ----------
  {
    id: 'same-cpf-same-person',
    local: patient({
      name: [name(['João'], 'Souza')],
      birthDate: '1987-03-14',
      identifier: [cpf(CPF_1)],
    }),
    incoming: patient({
      name: [name(['João'], 'Souza')],
      birthDate: '1987-03-14',
      identifier: [cpf('11144477735')],
    }),
    expected: 'match',
    why: 'a valid CPF from the trusted system is strong evidence besides name and date',
  },
  {
    id: 'same-cpf-different-name',
    local: patient({ name: [name(['João'], 'Souza')], identifier: [cpf(CPF_2)] }),
    incoming: patient({ name: [name(['Carla'], 'Pereira')], identifier: [cpf(CPF_2)] }),
    expected: 'possible',
    why: 'owner decision 4: a shared CPF with a different name goes to human review',
  },
  {
    id: 'different-cpf-everything-else-equal',
    local: patient({
      name: [name(['João'], 'Souza')],
      birthDate: '1987-03-14',
      identifier: [cpf(CPF_1)],
      telecom: [phone('(41) 99876-5432')],
    }),
    incoming: patient({
      name: [name(['João'], 'Souza')],
      birthDate: '1987-03-14',
      identifier: [cpf(CPF_3)],
      telecom: [phone('(41) 99876-5432')],
    }),
    expected: 'no-match',
    vetoes: ['identifier-conflict'],
    why: 'two valid, different CPFs belong to two people; the check digits rule out a typo',
  },
  {
    id: 'identifier-without-system',
    local: patient({
      name: [name(['Ana'], 'Souza')],
      birthDate: '1980-06-15',
      identifier: [{ value: '12345' }],
    }),
    incoming: patient({
      name: [name(['Carla'], 'Pereira')],
      birthDate: '1972-01-09',
      identifier: [{ value: '12345' }],
    }),
    expected: 'no-match',
    why: 'a value without a system is a number from anywhere; equal values mean nothing',
  },
  {
    id: 'untrusted-system-with-name-and-birthdate',
    local: patient({
      name: [name(['Ana'], 'Souza')],
      birthDate: '1980-06-15',
      identifier: [{ system: 'urn:example:clinic-a:mrn', value: 'A-1001' }],
    }),
    incoming: patient({
      name: [name(['Ana'], 'Souza')],
      birthDate: '1980-06-15',
      identifier: [{ system: 'urn:example:clinic-a:mrn', value: 'A-1001' }],
    }),
    expected: 'possible',
    why: 'an identifier from a system nobody configured cannot score, so this is name + date only',
  },
  {
    id: 'ssn-not-trusted-by-default',
    local: patient({
      name: [name(['Emily'], 'Carter')],
      birthDate: '1985-09-12',
      identifier: [{ system: 'http://hl7.org/fhir/sid/us-ssn', value: '987-65-4320' }],
    }),
    incoming: patient({
      name: [name(['Megan'], 'Brooks')],
      birthDate: '1979-02-27',
      identifier: [{ system: 'http://hl7.org/fhir/sid/us-ssn', value: '987-65-4320' }],
    }),
    expected: 'no-match',
    why: 'SSNs are often invalid or reused, so they do not score unless configured',
  },

  // ---------- placeholders ----------
  {
    id: 'placeholders-are-not-agreement',
    local: patient({
      name: [name(['Ana'], 'Souza')],
      birthDate: '1980-06-15',
      identifier: [cpf('000.000.000-00')],
      telecom: [phone('(41) 99999-9999'), email('noemail@example.com')],
    }),
    incoming: patient({
      name: [name(['Carla'], 'Pereira')],
      birthDate: '1980-06-15',
      identifier: [cpf('000.000.000-00')],
      telecom: [phone('(41) 99999-9999'), email('noemail@example.com')],
    }),
    expected: 'no-match',
    why: 'equal placeholders are missing data on both sides, not shared data',
  },
  {
    id: 'placeholders-cannot-confirm',
    local: patient({
      name: [name(['Ana'], 'Souza')],
      birthDate: '1980-06-15',
      identifier: [cpf('000.000.000-00')],
      telecom: [phone('(41) 99999-9999'), email('noemail@example.com')],
    }),
    incoming: patient({
      name: [name(['Ana'], 'Souza')],
      birthDate: '1980-06-15',
      identifier: [cpf('000.000.000-00')],
      telecom: [phone('(41) 99999-9999'), email('noemail@example.com')],
    }),
    expected: 'possible',
    why: 'placeholders add nothing, so this is name + date only, which needs human review',
  },
  {
    id: 'newborn-registered-twice',
    local: patient({
      name: [name(['RN de Maria'], 'Souza')],
      birthDate: '2026-01-10',
      telecom: [phone('(41) 99876-5432')],
    }),
    incoming: patient({
      name: [name(['RN de Maria'], 'Souza')],
      birthDate: '2026-01-10',
      telecom: [phone('(41) 99876-5432')],
    }),
    expected: 'possible',
    why: '"RN de <mother>" names the mother; it may be one baby twice or twins',
  },
  {
    id: 'newborn-named-later',
    local: patient({
      name: [name(['RN de Maria'], 'Souza')],
      birthDate: '2026-01-10',
      telecom: [phone('(41) 99876-5432')],
    }),
    incoming: patient({
      name: [name(['Lucas'], 'Souza')],
      birthDate: '2026-01-10',
      telecom: [phone('(41) 99876-5432')],
    }),
    expected: 'possible',
    why: 'the newborn record got a real name later; worth review, never an automatic merge',
  },

  // ---------- spelling variants (added in session 9) ----------
  // Added after the first calibration to document what the matcher cannot do. The expected
  // answers are what a person would say, written before any attempt to make them pass.
  {
    id: 'family-spelling-variant-z-s',
    local: patient({
      name: [name(['Ana'], 'Souza')],
      birthDate: '1980-06-15',
      telecom: [phone('(41) 99876-5432')],
    }),
    incoming: patient({
      name: [name(['Ana'], 'Sousa')],
      birthDate: '1980-06-15',
      telecom: [phone('(41) 99876-5432')],
    }),
    expected: 'match',
    why: 'Souza and Sousa are two spellings of one family name; date and mobile agree',
  },
  {
    id: 'given-spelling-variant-z-s',
    local: patient({
      name: [name(['Luiz'], 'Pereira')],
      birthDate: '1979-11-02',
      telecom: [phone('(21) 98765-4321')],
    }),
    incoming: patient({
      name: [name(['Luis'], 'Pereira')],
      birthDate: '1979-11-02',
      telecom: [phone('(21) 98765-4321')],
    }),
    expected: 'match',
    why: 'Luiz and Luis are one given name spelled two ways; date and mobile agree',
  },
  {
    id: 'given-spelling-variant-k-c',
    local: patient({
      name: [name(['Kátia'], 'Oliveira')],
      birthDate: '1984-02-17',
      telecom: [phone('(31) 99876-5432')],
    }),
    incoming: patient({
      name: [name(['Cátia'], 'Oliveira')],
      birthDate: '1984-02-17',
      telecom: [phone('(31) 99876-5432')],
    }),
    expected: 'match',
    why: 'Kátia and Cátia are one given name spelled two ways; date and mobile agree',
  },

  // ---------- sparse records ----------
  {
    id: 'name-only',
    local: patient({ name: [name(['Maria'], 'Silva')] }),
    incoming: patient({ name: [name(['Maria'], 'Silva')] }),
    expected: 'no-match',
    why: 'a shared common name alone identifies nobody',
  },
  {
    id: 'name-and-birthdate-only',
    local: patient({ name: [name(['Maria'], 'Silva')], birthDate: '1990-07-21' }),
    incoming: patient({ name: [name(['Maria'], 'Silva')], birthDate: '1990-07-21' }),
    expected: 'possible',
    why: 'name + birth date is "Good" in the HL7 identity-matching IG, not enough to merge',
  },
  {
    id: 'name-and-birthdate-contacts-conflict',
    local: patient({
      name: [name(['Maria'], 'Silva')],
      birthDate: '1990-07-21',
      telecom: [phone('(11) 98765-4321'), email('maria.silva@example.com')],
    }),
    incoming: patient({
      name: [name(['Maria'], 'Silva')],
      birthDate: '1990-07-21',
      telecom: [phone('(21) 97654-3210'), email('m.silva90@example.com')],
    }),
    expected: 'possible',
    why: 'common name and date with other contacts: could be two people or new contacts',
  },
  {
    id: 'nothing-to-compare',
    local: patient({}),
    incoming: patient({}),
    expected: 'no-match',
    why: 'two empty records share no evidence at all',
  },
];
