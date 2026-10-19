# fhir-patient-reconcile

Open-source TypeScript library (npm) for explainable matching and fail-closed merging of FHIR R4 `Patient` resources.

## Read first
These planning files are local-only (git-ignored, not in the public repo).
- `docs/planning/plan-v0.1.md` — approved plan (scope, API, stack, risks, 15-session schedule). Written in Portuguese.
- `docs/planning/README.draft.md` — README draft.
- `docs/planning/type-compat-spike.ts` — spike proving the `PatientLike` type rules below.

## Ground rules
- Code, identifiers, comments, README, docs and commit messages in **English**. Chat with the owner may be in Portuguese.
- **No employer code, data, names or internal details.** Everything is written from scratch. All test data is synthetic: invented names, `example.com` emails, fictional phone ranges, algorithmically generated CPFs.
- Work in small, verifiable steps that follow the schedule in the plan. Each session ends with a check that passes (a command or a file).
- Ask the owner before any decision the plan doesn't cover.

## Approved decisions
- Package name `fhir-patient-reconcile` (unscoped). License **Apache-2.0**. Dual **ESM + CJS** + types, verified with `publint` and `@arethetypeswrong/cli`.
- Stack: pnpm, TypeScript 7 strict (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `isolatedDeclarations`, `verbatimModuleSyntax`), tsdown (tsup is unmaintained), Vitest + fast-check + `expectTypeOf`, Biome, Changesets, GitHub Actions with npm Trusted Publishing (provenance). `engines: node >=22`; CI on Node 22/24/26.
- **Zero runtime dependencies.** Own BR + US phone normalizer with a pluggable hook.
- Brazil and US data both supported in v0.1.
- Same CPF + completely different name → `possible` (human review). The merge still refuses, because it requires `match`.

## Non-negotiable invariants
- **Type compatibility** with `@types/fhir` (R4 and R5) and `@medplum/fhirtypes` is a hard requirement, enforced by type tests in CI under both `exactOptionalPropertyTypes: true` and `false`:
  - every optional property is `?: T | undefined`;
  - no index signatures on public input types;
  - nested code fields are typed as `string`;
  - `mergePatient<P extends PatientLike>` returns the caller's own type.
- **Merge is fail-closed:**
  - merge only on `match`; accepting `possible` requires explicit opt-in;
  - the default policy is `fill-empty-only`;
  - `protectedPaths` are never written;
  - only allowlisted paths can change;
  - inputs are never mutated and data is never removed;
  - a refused merge returns an unchanged copy of the local patient.
- **No PHI in explanations or change reports** unless `includeValues: true`.
- `score` is a ranking aid, never presented as a probability.

## Testing philosophy
Green tests built on the same assumption as the code only validate that assumption.
- Use external oracles: published Jaro-Winkler reference values, CPF check-digit rules, NANP and Anatel phone formats.
- Write the hard-case table (expected decision + one-line WHY) **before** tuning weights.
- If a case can't pass, mark it as a `known-limitation` and document it. Never change the expected answer to make a test pass.
- Use property-based tests for invariants: match symmetry, idempotent normalizers, merge never overwrites, merge is idempotent.
