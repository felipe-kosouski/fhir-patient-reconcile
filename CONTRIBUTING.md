# Contributing

Thanks for your interest. Issues and pull requests are welcome. For a larger change (a new
field, a new country, a change to the default weights), please open an issue first, so we can
agree on the expected behavior before code is written.

Please report security problems privately, as described in [SECURITY.md](SECURITY.md).

## Setup

Requires Node.js 22 or later and pnpm (the version is pinned in `package.json`).

```bash
pnpm install
pnpm check
```

`pnpm check` is what CI runs, and it must pass before a pull request is merged:

| Step | Command |
|---|---|
| Lint and format (Biome) | `pnpm lint` (`pnpm lint:fix` fixes what it can) |
| Typecheck, with `exactOptionalPropertyTypes` on and off | `pnpm typecheck` |
| Unit, property, hard-case and type tests, with coverage | `pnpm test` |
| Build (ESM + CJS + declarations) | `pnpm build` |
| Load the built package through `import` and `require`, and run [`examples/`](examples/) | `pnpm test:package` |
| Package checks (publint, Are the Types Wrong) | `pnpm check:package` |

`pnpm test` fails if coverage of `src/match` or `src/merge` drops below 90%.

## Ground rules

**Synthetic data only.** Never put real patient data in an issue, a test or an example, not even
"anonymized". Use invented names, `example.com` email addresses (RFC 2606), phone numbers from
ranges reserved for fiction (NANP `555-0100` to `555-0199`, UK `020 7946 0000` to `0999`),
obviously patterned Brazilian numbers such as `(41) 99876-5432`, and CPFs generated with the
check-digit rule.

**Tests must be able to fail.** A test built on the same assumption as the code only confirms
the assumption, so:

- Check against something independent of the code where one exists: published reference values,
  check-digit rules, numbering plans, the real `@types/fhir` and Medplum packages.
- When you add a property test, break the code on purpose and confirm the property fails. A
  property over random inputs that never reach the interesting path proves nothing (most random
  pairs never merge, for example; see the guard test in `test/property/merge.property.test.ts`).
- Property tests also assert that valid generated inputs produce a result, so they cannot pass
  by rejecting everything.

**Hard cases come before weights.** Matching behavior is defined by the
[hard-case table](test/cases/match-cases.ts): each case has an expected decision and a one-line
reason. Add the case first, with the honest answer, then change the code. If the matcher cannot
get a case right, list it in [`known-limitations.ts`](test/cases/known-limitations.ts) (it then
runs as an expected failure) and in the README's Known limitations section. **Never change a
case's expected answer to make a test pass.** After a change to matching, regenerate the
calibration report with `pnpm vitest run test/cases -u` and review its diff.

**Untrusted input.** The incoming record comes from outside:

- Values of the wrong type (null, numbers, objects) are treated as missing, never thrown on.
- No input may cause super-linear work without a bound. Measure a new normalizer or comparator
  on hostile input (long runs of spaces, huge arrays, very long strings). A regex with adjacent
  optional whitespace (`\s*;?\s*`) has already shipped once with cubic backtracking.
- Use `Map` and `Set`, not object literals, for lookups keyed by input (`constructor` is a key).

**No patient values in explanations or change reports** unless `includeValues: true`. Reasons
are fixed sentences.

**Merge stays fail-closed.** Merge only on `match` (or `possible` with explicit opt-in), never
overwrite or remove local data, never write outside the allowlist or to protected paths, and
return an unchanged copy on refusal. [ADR-0002](docs/adr/0002-fail-closed-merge.md) explains why.

**Type compatibility.** Public input types must stay assignable from `@types/fhir` (R4 and R5)
and `@medplum/fhirtypes`, with `exactOptionalPropertyTypes` on and off: optional properties are
`?: T | undefined`, no index signatures, nested codes are `string`, arrays are `readonly`. See
[ADR-0001](docs/adr/0001-own-fhir-types.md).

**Zero runtime dependencies.** Development dependencies are fine.

## Documentation

- Every example in the README has a runnable twin in [`examples/`](examples/) that asserts the
  same results; change both together.
- Design decisions go in [`docs/adr/`](docs/adr/) as a new numbered record.
- Code, comments and docs are in English. Comments explain why, not what.

## Commits

Small commits with a conventional prefix (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`,
`chore:`) and a body that says why the change was needed.

## License

By contributing, you agree that your contribution is licensed under the
[Apache License 2.0](LICENSE), the license of this project.
