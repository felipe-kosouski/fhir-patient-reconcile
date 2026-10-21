# ADR-0002: A fail-closed merge

- Status: accepted
- Date: 2026-10-21

## Context

`mergePatient(local, incoming)` copies demographic data from a record received from elsewhere
(another system, a health information exchange) into a copy of the local record. A wrong merge
is worse than no merge:

- Data from another person written into a chart is a clinical safety problem, and it is hard
  to notice and to undo. A missed merge only leaves a duplicate for a person to resolve.
- The incoming record is untrusted. It may be stale, wrong, belong to someone else, or be built
  to cause trouble (huge arrays, very long strings, values of the wrong type).
- The local record may hold data a person confirmed or corrected. FHIR has no single standard
  way to say so.

So every choice below picks the outcome that leaves the local record as it was when there is
any doubt. "Fail-closed" means: when a rule cannot decide, nothing is written.

## Decision

**1. The merge decides on its own match.** `mergePatient` always runs `matchPatients` (with
`matchOptions`). A `match` result passed in is not trusted: it must equal that run (decision,
points, grade, evidence, thresholds and vetoes), or the merge refuses. A stale result, a result
for other patients or a result computed with other options cannot authorize a merge.

**2. Only a `match` merges by default.** `possible` merges only with an explicit
`require: 'possible'`. Any veto refuses, whatever `require` says, even when an equal trusted
identifier lifted the decision to `possible`.

**3. A refusal changes nothing.** A refused merge returns an unchanged copy of the local patient
and an empty change report, with the reason.

**4. Fill empty fields only.** The only policy in v0.1 is `fill-empty-only`: a field is written
only when the local record has nothing there. "Nothing" means absent (`undefined` or `null`).
Anything else counts as data and is kept: a placeholder, a partial date, a blank string, a value
of the wrong type, or a `_birthDate` / `_gender` element (such as a data-absent-reason
extension). The merge never overwrites and never removes.

**5. An allowlist of paths.** Only `birthDate`, `gender`, `name`, phones and emails in `telecom`
and `address` can change. Every other element of either record (identifiers, links, extensions,
`meta`, `active`, deceased) is left alone. Granularity:

- `name` only when local has no name entry;
- `telecom` per system: phones and emails are handled separately, and only when local has no
  entry of that system. `sms`, `fax` and other systems are never touched;
- `address` only when local has no address.

**6. Only valid, fresh copies.** An incoming entry is copied only if it normalizes (placeholders
do not), as a new object with its known string fields trimmed. Extensions and unknown fields are
not copied, so the result shares no object with either input. Entries that are the same after
normalization collapse into one.

**7. Bounded work.** A merge copies at most 10 entries per path, and an entry with a text field
over 1,000 characters is invalid. 100,000 incoming emails must not become 100,000 local ones.

**8. Protected paths are never written.** The caller lists the paths a person confirmed or
edited (`protectedPaths`), because the library cannot know. This beats every other option,
including `arrays`.

**9. Appending is opt-in.** `arrays: { telecom: 'append-new', address: 'append-new' }` lets a
merge add incoming entries after the local ones when local already has some. Only entries that
are not already local are added:

- phones are the same when they normalize to the same number (`+55 41 99876-5432` and
  `(41) 99876-5432`); emails when they normalize to the same address;
- addresses are the same when they have the same postal code and street line. Without a postal
  code on one side: the same line and no city that differs. A near copy that only adds a city
  or spells `R.` for `Rua` is not new information.

Local entries are never changed, reordered or removed. A local `telecom` or `address` that is
not an array is kept as it is. Names are never appended: a second name is not more
information about the person, and choosing between names is a human decision.

**10. A report without patient values.** Each path the incoming record offers something for
gets one change: `filled`, `appended` (with how many entries were added and how many were
already local), `kept-local`, `skipped-duplicate`, `skipped-protected` or `skipped-invalid`,
with the `source` label on changes taken from the incoming record. The incoming value appears
only with `includeValues: true`, like explanations in `matchPatients`.

**11. No mark in the resource.** v0.1 adds nothing to the merged patient to say where a value
came from; provenance lives in the change report only. Generating a FHIR `Provenance` resource
is planned for a later version.

## Alternatives considered

- **Trust a `match` passed in.** Cheaper, but a caller could pass a result for other patients or
  options by mistake, and the merge would then write data it never checked.
- **Merge on `possible` by default.** `possible` means "a person should look", per FHIR's
  match-grade. Merging it automatically would remove the review it asks for.
- **Newest value wins, or incoming wins.** Both overwrite data that may have been confirmed by a
  person, and "newer" is not known reliably (`meta.lastUpdated` says when a record changed, not
  when a field was checked).
- **Treat placeholders and partial dates as empty.** Tempting, since `1987` is less than
  `1987-03-14`, but the local value may be a deliberate choice, and a placeholder may mark that
  the value was asked for and refused. Filling it would be an overwrite.
- **Append by default.** Records collect stale phones and addresses over the years. Adding every
  incoming entry would make the local record worse unless the caller has decided it wants that.
- **Read `meta.tag` or `Provenance` to find human edits.** There is no single convention, so
  v0.1 leaves it to the caller through `protectedPaths`.

## Consequences

- A merge often writes nothing. That is the intended outcome when local already has data; the
  change report says why for each path.
- Callers must pass the same `matchOptions` they matched with, or a `match` they pass in is
  refused.
- A caller who wants to correct data, not only fill gaps, has to do it outside this library.
- The duplicate rules for `append-new` are deliberately strict about what is new. Two spellings
  of the same street without postal codes (`Rua das Flores 100` and `Rua Flores 100`) are both
  kept.
- Enforced by `test/unit/merge/merge.test.ts`. Property tests for "never overwrites, never
  removes, idempotent" follow in a later session.
