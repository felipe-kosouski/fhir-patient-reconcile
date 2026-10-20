# fhir-patient-reconcile

> Explainable matching and fail-closed merging of FHIR R4 `Patient` resources, for TypeScript and Node.js.

[![CI](https://github.com/felipe-kosouski/fhir-patient-reconcile/actions/workflows/ci.yml/badge.svg)](https://github.com/felipe-kosouski/fhir-patient-reconcile/actions/workflows/ci.yml)
![zero dependencies](https://img.shields.io/badge/runtime_dependencies-0-brightgreen)
![license](https://img.shields.io/badge/license-Apache--2.0-blue)

> [!NOTE]
> **Work in progress.** Normalizers and `matchPatients` work today; calibration against the
> hard-case table and the fail-closed merge are being built next, and the package is not on npm
> yet.
> See [Status](#status) for exactly what works today.

## The problem

You already have a patient in your system. A Health Information Exchange, a partner API or an
intake form sends you another `Patient` resource. You need to answer two questions:

1. **Is this the same person?** Real data is messy: `João` vs `JOAO`, a missing middle name,
   `+55 41 99876-5432` vs `(41) 99876-5432`, day and month swapped, a family landline shared by
   everyone in the house, twins born on the same day.
2. **What can I safely take from the incoming record?** Data a person typed in by hand must never
   be overwritten by an external source, and when in doubt the answer should be "change nothing".

The TypeScript FHIR ecosystem has good clients, type definitions and validators, but no library
for this job. Full Master Patient Indexes (HAPI FHIR MDM, OpenEMPI) and the `Patient/$match`
operation in servers such as Medplum solve the 1:N search problem inside a server.
`fhir-patient-reconcile` solves the smaller 1:1 problem as a plain function you can call anywhere.

> [!WARNING]
> This library is not a Master Patient Index and not a medical device. It compares two records
> and explains why they look alike; it does not decide clinical identity.

## Design goals

- **Explainable.** Every match result lists each field's outcome (`exact`, `fuzzy`, `missing`,
  `conflict`), its points and a human-readable reason. `score` is a ranking aid, never presented
  as a probability.
- **Fail-closed merge.** Merge only on a confident `match`; `possible` needs an explicit opt-in.
  The default policy fills empty fields only, protected paths are never written, only allowlisted
  demographic paths can change, inputs are never mutated, and a refused merge returns an
  unchanged copy of the local patient.
- **Private by default.** Explanations and change reports contain no raw values (no PHI in logs)
  unless you pass `includeValues: true`.
- **Brazilian and US data.** Portuguese name particles (`da`, `dos`), generational suffixes
  (`Filho`, `Neto`, `Jr.`), CPF check digits, Brazilian mobiles with and without the ninth digit,
  NANP numbers.
- **Works with the types you already use.** Accepts `Patient` from `@types/fhir` (R4 and R5) and
  `@medplum/fhirtypes` without casts, and `mergePatient` returns your own type back.
- **Zero runtime dependencies.** Dual ESM + CommonJS with type declarations.

## Status

| Area | State |
|---|---|
| Package scaffold: TypeScript 7 strict, dual ESM/CJS build, CI on Node 22/24/26 | ✅ done |
| FHIR input types with compatibility tests against `@types/fhir` and Medplum | ✅ done |
| `normalizeText`, `normalizeName` | ✅ done |
| `normalizePhone` (Brazil + NANP, ninth digit), `normalizeEmail`, placeholder values | ✅ done |
| `normalizeBirthDate` (partial dates), `normalizeAddress` (CEP/ZIP + street line), `normalizeCpf` | ✅ done |
| Hard-case table for matching: 40 cases with expected decisions, written before any weights | ✅ done |
| `jaroWinkler`, `damerauLevenshtein` (checked against published reference values) | ✅ done |
| Per-field comparators (outcome, points and a reason without patient values, per field) | ✅ done |
| `matchPatients` (weights, thresholds, vetoes, minimum evidence, FHIR `match-grade`) | ✅ done: 39 of 40 hard cases pass |
| Calibration against the hard-case table; known limitations documented | 🚧 next |
| `mergePatient` (fail-closed, change report) | ⏳ planned |
| npm release `0.1.0` with provenance | ⏳ planned |

## What works today

```ts
import { matchPatients } from 'fhir-patient-reconcile';

const local = {
  resourceType: 'Patient',
  name: [{ family: 'Souza', given: ['João', 'Pedro'] }],
  birthDate: '1987-03-14',
  telecom: [{ system: 'phone', value: '(41) 99876-5432' }],
} as const;

const incoming = {
  resourceType: 'Patient',
  name: [{ family: 'SOUZA', given: ['Joao'] }],
  birthDate: '1987-03-14',
  telecom: [
    { system: 'phone', value: '+55 41 99876 5432' },
    { system: 'email', value: 'joao.souza@example.com' },
  ],
} as const;

const result = matchPatients(local, incoming, { defaultCountry: 'BR' });
result.decision;   // 'match'
result.matchGrade; // 'certain' (FHIR $match vocabulary)
result.points;     // 17 (match needs 14, plus name + birth date + one more agreeing field)
result.fields;     // one entry per field, no patient values unless includeValues: true
//   family     exact    +4  "every family name on one side appears on the other"
//   given      exact    +4  "first given names are equal"
//   middle     missing   0  "no middle name on one or both sides"   (never penalized)
//   birthDate  exact    +5  "birth dates are equal"
//   phone      exact    +4  "a phone number is shared"
//   email      missing   0  "no usable email address on one or both sides"

const twin = { ...incoming, name: [{ family: 'Souza', given: ['Joana'] }] } as const;
matchPatients(local, twin, { defaultCountry: 'BR' }).decision;
// 'possible' (10 points): a different first name never merges automatically

const grandson = { ...local, name: [{ family: 'Souza Neto', given: ['João'] }], birthDate: '2010-05-02' } as const;
matchPatients({ ...local, name: [{ family: 'Souza Filho', given: ['João'] }] }, grandson).vetoes;
// [generational-suffix-conflict, birthdate-conflict]: decision 'no-match', grade 'certainly-not'
```

Building blocks, also exported:

```ts
import {
  damerauLevenshtein,
  jaroWinkler,
  normalizeAddress,
  normalizeBirthDate,
  normalizeCpf,
  normalizeName,
  normalizePhone,
  normalizeText,
} from 'fhir-patient-reconcile';

normalizeName({ family: 'da Silva Souza Filho', given: ['João Pedro'] });
// {
//   given: 'joao',
//   middle: ['pedro'],
//   family: ['silva', 'souza'],   // "da" dropped: a particle between names
//   suffix: 'filho',              // generational suffix, kept for veto checks
//   source: 'parts',
// }

normalizeName({ text: 'Dra. Maria de Lourdes Souza' });
// { given: 'maria', middle: ['lourdes'], family: ['souza'], suffix: undefined, source: 'text' }

normalizeText('  D’Ávila-SOUZA ');
// 'davila souza'

normalizePhone('(41) 9876-5432', { defaultCountry: 'BR' });
// { e164: '+5541998765432', line: 'mobile', ninthDigitAdded: true }  (old 8-digit mobile)

normalizePhone('(415) 555-0123');
// undefined: also a valid Brazilian landline, and no defaultCountry was given

normalizeName({ given: ['RN de Maria'], family: 'Souza' });
// undefined: a newborn placeholder describes the mother, so it counts as missing

normalizeBirthDate('1987-03');
// { value: '1987-03', precision: 'month', year: 1987, month: 3, day: undefined }

normalizeBirthDate('1900-01-01');
// undefined: a common "unknown" sentinel, so it counts as missing

normalizeCpf('111.444.777-35');
// '11144477735' (check digits verified; 000.000.000-00 passes the checksum but is rejected)

normalizeAddress({ line: ['R. das Flores, nº 100'], city: 'Curitiba', postalCode: '80010-000' });
// { line: 'rua das flores 100', city: 'curitiba', state: undefined, postalCode: '80010000', country: 'BR' }

normalizeAddress({ line: ['123 N Main St.'], postalCode: '62701-1234' });
// { line: '123 north main street', city: undefined, state: undefined, postalCode: '62701', country: 'US' }

jaroWinkler('martha', 'marhta');
// 0.9611 (Winkler's published value: 0.961)

damerauLevenshtein('CA', 'ABC');
// 2: CA -> AC -> ABC (unrestricted; "optimal string alignment" would give 3)
```

## Planned API (v0.1)

Not implemented yet. This is the target the work above builds toward.

```ts
import { matchPatients, mergePatient } from 'fhir-patient-reconcile';

const match = matchPatients(local, incoming, { defaultCountry: 'BR' });
const result = mergePatient(local, incoming, {
  match,
  protectedPaths: ['telecom.phone', 'address'], // a human confirmed these
  source: 'hie:example',
});
result.status;  // 'merged' | 'refused'
result.changes; // e.g. { path: 'telecom[system=email]', action: 'filled', origin: 'incoming' }
```

## Engineering notes

How correctness is checked, not just asserted:

- **External oracles.** Type compatibility is checked against the real `@types/fhir` and
  `@medplum/fhirtypes` packages, not against a copy of their shapes. Phones follow the Anatel and
  NANP numbering plans; CPF tests use published worked examples and a second, independently
  written form of the check-digit rule; birth dates are checked against the JavaScript calendar.
  Jaro-Winkler follows Winkler's reference code (`strcmp95.c`) and is checked against his
  published values, Apache Commons Text's reference table and rapidfuzz (within 0.001);
  Damerau-Levenshtein against Wikipedia's worked example, rapidfuzz and two independently
  written reference distances (optimal string alignment and plain Levenshtein).
- **Type tests that are proven to fail.** The type-compatibility suite runs under both
  `exactOptionalPropertyTypes: true` and `false`. Each design rule was broken on purpose
  (index signature, missing `| undefined`, code unions, mutable arrays) to confirm the suite
  catches it. See [ADR-0001](docs/adr/0001-own-fhir-types.md).
- **Property-based tests** with fast-check: normalizers are idempotent, ignore formatting
  (separators, parentheses, country codes) and never mutate input.
  These already caught a real bug (a doubled generational suffix normalized differently on a
  second pass), and each new property is confirmed by breaking the code on purpose.
- **Hard cases written before tuning.** The [hard-case table](test/cases/match-cases.ts) holds
  40 difficult pairs (twins, Jr. vs Sr., Filho vs Neto, married surname, swapped day and month,
  placeholder CPFs, newborns registered as "RN de Maria") with the expected decision and a
  one-line reason each. It was written before any matching code exists, and the weights will be
  calibrated against it. Cases that cannot pass are documented as known limitations instead of
  having their answers changed.
- **Bounded work on untrusted input.** The incoming record comes from outside, so every
  normalizer and comparator is measured on hostile input (long runs of spaces, huge arrays).
  A review found and fixed a phone regex with cubic backtracking; best-pair name and address
  matching compares at most 10 distinct entries per side.
- **Packaging verified.** `publint --strict` and `@arethetypeswrong/cli` run in CI, and smoke
  tests load the built package through both `import` and `require`.
- **Synthetic data only.** Invented names, `example.com` emails, fictional phone ranges and
  algorithmically generated CPFs. No real patient data anywhere.

## Development

Requires Node.js 22 or later and pnpm (the version is pinned in `package.json`).

```bash
pnpm install
pnpm check   # lint, typecheck (both modes), tests, build, ESM/CJS smoke tests, publint, attw
```

## Related work

- [Medplum `Patient/$match`](https://www.medplum.com/docs/api/fhir/operations/patient-match): server-side `$match` based on the CMS Patient Matching framework.
- [HL7 Interoperable Digital Identity and Patient Matching IG](http://hl7.org/fhir/us/identity-matching/): input weighting and match-quality guidance.
- [Splink](https://github.com/moj-analytical-services/splink): probabilistic (Fellegi-Sunter) record linkage at scale, in Python.

## License

[Apache-2.0](LICENSE)
