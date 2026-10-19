# ADR-0001: Own minimal FHIR types, structurally compatible with the major packages

- Status: accepted
- Date: 2026-10-19

## Context

The public API takes FHIR `Patient` resources. Consumers already have their own typings,
mostly `@types/fhir` (R4 and R5 namespaces) or `@medplum/fhirtypes`. The library has a
zero-runtime-dependency rule and only reads a handful of demographic fields.

There were three options:

1. Depend on `@types/fhir` (as a dependency or peer dependency) and use `fhir4.Patient`.
   This ties every consumer to one typing package and version, and Medplum users would
   still need casts.
2. Accept `unknown` and validate at runtime. Type safety is lost at the boundary where it
   is most useful.
3. Declare a minimal structural subset (`PatientLike`) that every common `Patient` type is
   assignable to.

## Decision

Option 3. `src/types/fhir.ts` declares `PatientLike` and its nested types. Compatibility
with `@types/fhir` (R4 and R5) and `@medplum/fhirtypes` is a hard requirement, not a goal.
Both packages are dev dependencies only and are used solely by type tests.

A spike showed that a naive subset fails, so the types follow four rules:

1. **Every optional property is `?: T | undefined`.** `@types/fhir` declares its optionals
   as `T | undefined`. With `exactOptionalPropertyTypes` on, a target declared as `?: T`
   rejects them.
2. **No index signatures.** Interfaces such as `fhir4.Patient` have no index signature of
   their own, so they are not assignable to a type that requires one.
3. **Nested code fields are `string`.** `ContactPoint.system`, `HumanName.use` and similar
   fields are typed as `string`, not as code unions. Each package spells its unions a little
   differently; `string` is a supertype of all of them. `gender` stays a closed union because
   every package agrees on its four values.
4. **Arrays are `readonly`.** Mutable arrays are assignable to readonly ones, so this only
   widens what is accepted. It lets callers pass `as const` literals, and it matches the
   invariant that inputs are never mutated.

Functions that return a patient are generic (`mergePatient<P extends PatientLike>`), so a
caller who passes a `fhir4.Patient` gets a `fhir4.Patient` back without a cast.

## Enforcement

- `test/types/compat.test-d.ts` checks that R4, R5 and Medplum `Patient` are assignable,
  that a generic constraint returns the caller's type, and that literals behave as documented.
  It runs twice: under `tsconfig.json` (`exactOptionalPropertyTypes: true`) and under
  `tsconfig.loose.json` (`false`).
- `test/types/rules.test-d.ts` checks rules 1–3 on our own types directly, so a new property
  that breaks a rule fails even if no external package exercises it.
- Each rule was verified by breaking it on purpose (index signature, missing `| undefined`
  at the top level and nested, code union, mutable array, widened gender) and confirming the
  suite fails.

## Consequences

- No runtime or type dependency for consumers.
- `PatientLike` must be updated by hand when the library starts reading a new field, and the
  type tests must be extended at the same time.
- A plain unannotated `const` object widens `resourceType` to `string` and is rejected.
  Callers use `as const`, `satisfies PatientLike` or an explicit type annotation. This is
  covered by a test and must be shown in the README examples.
- Writing incoming values into a caller's `P` (for example, a Medplum `ContactPoint` whose
  `system` is a code union) needs care in the merge implementation; this is a typing concern
  for the merge, not for the input types.
