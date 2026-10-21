# Examples

Runnable scripts that use the built package by name, exactly as an installed copy would. Each one
asserts every result the main [README](../README.md) shows, and CI runs all of them against
`dist/` on Node 22, 24 and 26.

| File | Shows |
|---|---|
| [`match.mjs`](match.mjs) | `matchPatients`: a match with its explanation, twins, a father/grandson veto |
| [`merge.mjs`](merge.mjs) | `mergePatient`: fill-empty-only, a refusal, protected paths, `append-new` |
| [`options.cjs`](options.cjs) | Options through `require()`: trusted identifier systems, a custom phone normalizer, `includeValues`, thresholds |
| [`building-blocks.mjs`](building-blocks.mjs) | The exported normalizers and similarity functions |

```bash
pnpm install
pnpm build
pnpm test:examples
```

All data is synthetic: invented names, `example.com` emails and phone numbers from ranges
reserved for fiction.
