# Security policy

`fhir-patient-reconcile` handles patient demographics, so some bugs here are security or privacy
problems rather than ordinary defects. Please report them privately.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting:
[**Report a vulnerability**](https://github.com/felipe-kosouski/fhir-patient-reconcile/security/advisories/new)
(the Security tab of this repository). Please do not open a public issue, pull request or
discussion for a suspected vulnerability.

Include the version (or commit), a minimal reproduction and the impact you expect. **Use
synthetic data only**: never send real patient data, not even "anonymized".

This project is maintained by one person, so reports are handled on a best-effort basis, in the
advisory thread. The aim is to publish a fix before the advisory is made public, and to credit
you if you wish.

## Supported versions

Until 1.0, only the latest published release receives fixes.

## What counts as a vulnerability

The library's guarantees are listed in the [README](README.md) and
[ADR-0002](docs/adr/0002-fail-closed-merge.md). Breaking one of these is in scope:

- **Patient data leaking** into an explanation, a veto reason or a change report without
  `includeValues: true`.
- **A merge that is not fail-closed**: writing on a decision other than `match` without
  `require: 'possible'`, merging despite a veto, overwriting or removing local data, writing a
  protected path or a path outside the allowlist, mutating an input, or a refusal that changes
  the local copy.
- **Denial of service from an incoming record**: input that makes matching or merging take
  super-linear time or memory (for example, a regular expression with catastrophic
  backtracking), or that makes the library throw on structurally valid FHIR JSON.
- **Prototype pollution** or similar effects from keys in the input.

Not in scope, but welcome as ordinary issues:

- A pair the matcher decides wrongly. Matching is a documented heuristic; please open an issue
  with a synthetic hard case and the decision you expect.
- Vulnerabilities in development dependencies that do not reach the published package (it has
  no runtime dependencies).
