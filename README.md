# fhir-patient-reconcile

> Explainable matching and fail-closed merging of FHIR R4 `Patient` resources, for TypeScript and Node.js.

[![CI](https://github.com/felipe-kosouski/fhir-patient-reconcile/actions/workflows/ci.yml/badge.svg)](https://github.com/felipe-kosouski/fhir-patient-reconcile/actions/workflows/ci.yml)
![zero dependencies](https://img.shields.io/badge/runtime_dependencies-0-brightgreen)
![license](https://img.shields.io/badge/license-Apache--2.0-blue)

> [!NOTE]
> **Work in progress.** The foundations (types, build, CI, name, phone and email normalization) are done.
> Matching and merging are being built next, and the package is not on npm yet.
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
| Birth date, address and CPF normalizers | 🚧 next |
| Jaro-Winkler and Damerau-Levenshtein | ⏳ planned |
| `matchPatients` (weights, thresholds, vetoes, FHIR `match-grade`) | ⏳ planned |
| `mergePatient` (fail-closed, change report) | ⏳ planned |
| npm release `0.1.0` with provenance | ⏳ planned |

## What works today

```ts
import { normalizeName, normalizePhone, normalizeText } from 'fhir-patient-reconcile';

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
```

## Planned API (v0.1)

Not implemented yet. This is the target the work above builds toward.

```ts
import { matchPatients, mergePatient } from 'fhir-patient-reconcile';

const match = matchPatients(local, incoming, { defaultCountry: 'BR' });
match.decision;   // 'match' | 'possible' | 'no-match'
match.matchGrade; // 'certain' | 'probable' | 'possible' | 'certainly-not' | null (FHIR $match vocabulary)
match.fields;     // per-field outcome, points and reason, without raw values

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
  `@medplum/fhirtypes` packages, not against a copy of their shapes. The upcoming similarity,
  CPF and phone tests follow the same rule: published Jaro-Winkler reference values, the CPF
  check-digit algorithm, and Anatel/NANP numbering formats.
- **Type tests that are proven to fail.** The type-compatibility suite runs under both
  `exactOptionalPropertyTypes: true` and `false`. Each design rule was broken on purpose
  (index signature, missing `| undefined`, code unions, mutable arrays) to confirm the suite
  catches it. See [ADR-0001](docs/adr/0001-own-fhir-types.md).
- **Property-based tests** with fast-check: normalizers are idempotent, ignore formatting
  (separators, parentheses, country codes) and never mutate input.
  These already caught a real bug (a doubled generational suffix normalized differently on a
  second pass).
- **Hard cases written before tuning.** The matching weights will be calibrated against a table
  of difficult cases (twins, Jr. vs father, married surname, swapped day and month), each with its
  expected decision and a one-line reason, written before any weight is tuned. Cases that cannot
  pass are documented as known limitations instead of having their answers changed.
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
