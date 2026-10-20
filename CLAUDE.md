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
  - US phones: NANP fiction range `555-0100`–`555-0199`. Brazil has no official fictional range, so use obviously patterned numbers (e.g. `(41) 99876-5432`).
- Work in small, verifiable steps that follow the schedule in the plan. Each session ends with a check that passes (a command or a file).
- Ask the owner before any decision the plan doesn't cover.

## Workflow
- `pnpm check` (lint, typecheck in both modes, tests, build, ESM/CJS smoke tests, publint, attw) must pass before every commit.
- One commit per session on `main`. Commit locally, then **ask the owner before pushing**; after a push, watch CI until it is green.
- The public repo is shown to recruiters. Keep the README's **Status** table and "What works today" examples in sync with each session, and run every README example against `dist/` before committing it. Never describe planned features as done.
- Design decisions go in `docs/adr/` (public, English).

## Approved decisions
- Package name `fhir-patient-reconcile` (unscoped). License **Apache-2.0**. Dual **ESM + CJS** + types, verified with `publint` and `@arethetypeswrong/cli`.
- Stack: pnpm, TypeScript 7 strict (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `isolatedDeclarations`, `verbatimModuleSyntax`), tsdown (tsup is unmaintained), Vitest + fast-check + `expectTypeOf`, Biome, Changesets, GitHub Actions with npm Trusted Publishing (provenance). `engines: node >=22`; CI on Node 22/24/26.
- **Zero runtime dependencies.** Own BR + US phone normalizer with a pluggable hook.
- Brazil and US data both supported in v0.1.
- Same CPF + completely different name → `possible` (human review). The merge still refuses, because it requires `match`.
- The README was pulled forward from session 14 (owner request) and is maintained every session.

## Normalization decisions (sessions 3–5)
- Normalizers return `undefined` for anything unusable; **placeholders count as missing**, never as agreement.
- Names: particles (da, de, do, das, dos, e) dropped only between two names; generational suffixes read from `HumanName.suffix` or trailing family tokens, never from given names; leading titles (Dr., Sra., Mr.) dropped from given names and `text` while another token remains; `text` parsed only without structured parts (first token = given, last = family, `source: 'text'`); placeholders are whole name parts (UNKNOWN, Não Informado) or whole names (RN de…, Bebê de…, Baby Girl…, John Doe, Fulano de Tal). Bebe or Doe alone are real names.
- Phones: output is `{ e164, line, ninthDigitAdded }` with no country label (+1 is also Canada). An explicit country code (`+` anywhere before the first digit, `00`, `011`) beats `defaultCountry`; service numbers are rejected (BR 0800/0300, NANP toll-free 8XX and 900); labels such as "Cel:" make the value invalid; a number valid in both countries without a default is rejected as ambiguous. Other countries go through `MatchOptions.normalizePhone`. Values over 64 characters after trimming are rejected.
- Emails: no provider-specific rules (Gmail dots and plus tags are kept). Valid = unquoted RFC 5322 dot-atom local part (Unicode letters allowed) + at least two RFC 1123 host labels, last one containing a letter.
- Birth dates: FHIR `date` only (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`), kept at their own precision; real calendar days only; date-times and `dd/mm/yyyy` rejected (ambiguous BR/US); years before 1900 and `1900-01-01` are placeholders. No "future date" check (keeps the function pure).
- Addresses (light): country from `Address.country` or the postal code shape (8 digits = CEP, 5/9 = ZIP); CEP as 8 digits, ZIP compared at 5; street abbreviations expanded only when the country is known (Correios for BR, USPS Pub. 28 for US; "Dr" is Doutor in BR, Drive in US); BR number markers ("nº") dropped before a number; `Address.text` not parsed; placeholders checked before expansion. Lookups use `Map`, never object literals (prototype keys).
- CPF: 11 digits with `.`/`-`/space separators; check digits verified; repeated digits and ascending sequences (`123.456.789-09`, `012.345.678-90`) are placeholders; lost leading zeros are not restored. RNDS system: `http://rnds.saude.gov.br/fhir/r4/NamingSystem/cpf` (from the RNDS CPF profile).
- Property tests must be able to fail: assert that generated *valid* inputs produce a result, and confirm new properties by breaking the code on purpose.

## Similarity (session 6)
- `jaroWinkler`: follows Winkler's reference code `strcmp95.c` (owner decision, session 6): window `floor(max/2) - 1`, transpositions = out-of-order matches / 2 **rounded down**, p = 0.1, prefix up to 4, bonus only when Jaro **> 0.7**. strcmp95's extensions (similar-character table, long-string adjustment, digits ending the prefix, case/space folding) are not applied, as in rapidfuzz. Oracles: Winkler 1990 values, Apache Commons Text's `JaroWinklerSimilarityTest` table (except `aaabcd`/`aaacdb`: Apache does not round down) and rapidfuzz 3.14.5 values, ±0.001.
- `damerauLevenshtein`: unrestricted (Lowrance-Wagner), so it is a metric; `CA -> ABC` = 2, not the OSA value 3.
- Both compare code points as given; callers normalize first.

## Field comparators (session 7)
- Internal (`src/match/`): `compareFields(local, incoming, options)` returns one `FieldResult` per field in `MatchField` order. `missing` always scores 0; reasons never contain patient values; `local`/`incoming` only with `includeValues`.
- Owner decisions: a partial birth date that agrees is `missing` (it can only disprove); names use the best whole-name pair across `name[]` (given/family/middle never mixed); addresses: same postal code + line = exact, same postal code or same line without postal codes = fuzzy, different postal codes, lines or countries = conflict, city/state alone not compared, best comparable pair across `address[]`; `MatchOptions.normalizePhone` replaces the built-in phone parser (`''` = unusable).
- Family names compare as sets (subset = exact, overlap or JW >= fuzzyMin = fuzzy); a name from `text` pools middle + family. Middle initials are fuzzy.
- Birth date fuzzy: day/month swapped, one day apart (UTC calendar), one year digit (same month and day). Two year digits (1987/1978) are a conflict.
- Phones from `phone` and `sms` contact points; no fuzzy step for phones or emails.
- Identifiers: trusted systems only (default: RNDS CPF; `identifierSystems.trusted` replaces the list); CPF values validated with `normalizeCpf`, others trimmed. Any trusted system with disjoint values is a conflict even if another agrees (fail closed).
- Every `MatchOptions` property (and nested ones) is `?: T | undefined`, checked in `test/types/rules.test-d.ts`.

## matchPatients (session 8)
- From the plan: `points` = sum of field points; `match` at >= 14, `possible` at >= 8 (`DEFAULT_THRESHOLDS`); `score` = points / sum of `exact` weights, clamped to 0..1; grade: match = certain, possible >= midpoint of the thresholds (11) = probable, else possible; no-match with a veto = certainly-not, without = `null`.
- Owner decisions:
  - A veto forces `no-match` (`certainly-not`). Birth-date veto only when the years differ (a same-year conflict costs points and stays reviewable; partial dates count).
  - Suffix veto when the chosen name pair has different generations; **Júnior and Filho are the same generation** (both = son with the father's exact name; vLex "Nome da pessoa natural", Crátilo 2019) and never conflict. On a tie between name pairs, the conflicting pair wins (keeps the veto symmetric).
  - Minimum evidence for `match` = agreement (exact or fuzzy) of given AND family, birth date, and one of identifier/phone/email/address.
  - An exact trusted identifier floors the decision at `possible`, even with a veto (owner decision 4 generalized).
  - Invalid options throw `RangeError` (non-finite weights/thresholds, `fuzzyMin` outside 0..1, possible > match, unknown option/field/outcome/threshold names, `defaultCountry` not BR/US) or `TypeError` (wrong types). Typos must never be ignored silently.
  - A vetoed pair lifted to `possible` by an equal identifier is graded `possible`, never `probable` (review, session 8).
- Review hardening (session 8): `includeValues` must be exactly `true` (a truthy string must not leak PHI); `DEFAULT_WEIGHTS`/`DEFAULT_THRESHOLDS` are frozen; points are rounded to 9 decimals before threshold comparisons (0.7 + 0.1 must reach 0.8).
- Input is untrusted FHIR JSON: anything that is not the expected type (null, numbers, objects) reads as missing, never throws. `null` inside arrays of primitives (`"given": ["Jim", null]`) is legal FHIR. Use `stringOrEmpty`/`strings` (normalize/text.ts) and `objects` (match/prepare.ts) when reading input; a property test feeds `fc.jsonValue()` into every field.
- Hard cases run in `test/cases/match-cases.match.test.ts`; cases the matcher gets wrong are listed in `test/cases/known-limitations.ts` and run with `it.fails` (turns red once fixed).

## Calibration (session 9, owner decisions)
- `possible` also needs one agreeing field besides the name (birth date, identifier, phone, email or address): a name alone, however many parts agree, is `no-match`. Fixed `name-only` without touching weights.
- Spelling variants (Souza/Sousa, Luiz/Luis, Kátia/Cátia) were added as hard cases with honest answers (`match`) and are known limitations (they come out `possible`). No phonetics (listed scope cut).
- `docs/calibration.md` is generated by `test/cases/calibration-report.test.ts` (`toMatchFileSnapshot`; stale = CI failure; regenerate with `pnpm vitest run test/cases -u`). It holds every case, the known limitations and a sensitivity table (smallest ± step per setting that breaks a case). Tightest margins today: 2 points (match threshold +2, possible threshold +2, several exact weights −2).
- The README's Known limitations section must stay in sync with `known-limitations.ts`; a test checks the README's case counts and quoted Jaro-Winkler values against the code.
- Review finding (session 9): boy/girl twins with masculine/feminine names (Daniel/Daniela, Paulo/Paula, JW 0.92-0.98) were auto-matched. Owner decision: `isGenderedPair` (o/e<->a, +a, +ia; names of 3+ letters) makes given and middle pairs a conflict, never fuzzy. Hard case `twins-boy-girl`. `fuzzyMin` stays 0.92 (owner): 0.86 would fix the spelling cases but also accept Lima/Lira.
- The sensitivity table probes every weight, both thresholds and `fuzzyMin`, scanning all steps (a fix after the first break must still be reported).

## Untrusted input: bounded work (session 7 review, owner decisions)
- The incoming record is untrusted, so no input may cause super-linear work without a bound. Measure hostile inputs (long runs, huge arrays) when adding a normalizer or comparator; quadratic code has shipped twice (phone regex, address markers).
- Names and addresses: duplicates dropped, then at most `MAX_ENTRIES` = 10 per side compared. Jaro-Winkler on at most the first 10 tokens of a name part (set equality uses all) and only on tokens of at most 40 characters (longer: equality only). Worst case for a hostile record ~0.1 s; typical pair ~0.02 ms.
- `normalizePhone` rejects values over 64 characters after trimming (before any regex). The extension regex must not have adjacent optional whitespace (`\s*;?\s*` was cubic).
- Contacts and identifiers use `Set` lookups, never `includes` in a loop.

## Hard-case table
- `test/cases/match-cases.ts`: expected decision + one-line WHY per case, written in session 5 before any matching code. A list of decisions means "any of these" and is used only where the plan sets a limit (twins: never `match`). `vetoes` lists vetoes that must be present.
- `test/cases/match-cases.test.ts` checks the table itself (synthetic data, every input parses under the case's options), so a case can only fail on its decision.

## Non-negotiable invariants
- **Type compatibility** with `@types/fhir` (R4 and R5) and `@medplum/fhirtypes` is a hard requirement, enforced by type tests in CI under both `exactOptionalPropertyTypes: true` and `false`:
  - every optional property is `?: T | undefined`;
  - no index signatures on public input types;
  - nested code fields are typed as `string`;
  - arrays are `readonly` (accepts `as const` literals; inputs are never mutated anyway);
  - `mergePatient<P extends PatientLike>` returns the caller's own type.
  - See `docs/adr/0001-own-fhir-types.md`. Under `nodenext` ESM, tests import `@types/fhir` as `'fhir/r4.js'` / `'fhir/r5.js'`.
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
