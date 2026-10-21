# fhir-patient-reconcile

## 0.1.0

### Minor Changes

- 74b99ca: First stable release: explainable matching and fail-closed merging of FHIR R4 `Patient` resources.
  
  - `matchPatients(local, incoming, options?)`: per-field outcomes (`exact`, `fuzzy`, `missing`,
    `conflict`) with points and a reason, a `match` / `possible` / `no-match` decision with vetoes
    and minimum evidence, and the FHIR `$match` grade. No patient values in explanations unless
    `includeValues: true`.
  - `mergePatient(local, incoming, options?)`: merges only on `match` (or `possible` with
    `require: 'possible'`), fills empty fields only, never writes protected paths or anything
    outside the demographic allowlist, optional `append-new` for phones, emails and addresses,
    and a change report. A refused merge returns an unchanged copy of the local patient.
  - Normalizers for names, Brazilian and NANP phones, emails, birth dates, addresses and CPF, plus
    Jaro-Winkler and Damerau-Levenshtein.
  - Zero runtime dependencies; ESM and CommonJS; types compatible with `@types/fhir` (R4 and R5)
    and `@medplum/fhirtypes`.
