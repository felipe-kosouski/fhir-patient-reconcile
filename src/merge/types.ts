import type { MatchOptions, MatchResult } from '../match/types.js';
import type { PatientLike } from '../types/fhir.js';

/** `T | undefined`, spelled out so optional options accept an explicit `undefined`. */
type Opt<T> = T | undefined;

/** The only merge policy in v0.1: a value is written only where the local record has none. */
export type MergePolicy = 'fill-empty-only';

/**
 * How a list path is merged when the local record already has entries there.
 * - `fill-empty-only` (default): nothing is written; the local entries stay as they are.
 * - `append-new`: valid incoming entries that are not already local (after normalization) are
 *   added after the local ones. Local entries are never changed or removed.
 */
export type ArrayPolicy = 'fill-empty-only' | 'append-new';

/** Per-path array policies. `telecom` covers phones and emails, each compared by system. */
export interface ArrayPolicies {
  telecom?: Opt<ArrayPolicy>;
  address?: Opt<ArrayPolicy>;
}

/** The fields a merge may write. `telecom` covers both `telecom.phone` and `telecom.email`. */
export type MergePath =
  | 'birthDate'
  | 'gender'
  | 'name'
  | 'telecom'
  | 'telecom.phone'
  | 'telecom.email'
  | 'address';

export interface MergeOptions {
  /**
   * A result from `matchPatients` for these two patients. It is always verified: the merge
   * runs `matchPatients` again (with `matchOptions`) and refuses if the result differs.
   */
  match?: Opt<MatchResult>;
  /** Options for the match that authorizes the merge (and for phone normalization). */
  matchOptions?: Opt<MatchOptions>;
  /** Minimum decision required to merge. Default `match`; `possible` must be explicit. */
  require?: Opt<'match' | 'possible'>;
  policy?: Opt<MergePolicy>;
  /** Paths a human confirmed or edited: never written, whatever `arrays` says. */
  protectedPaths?: Opt<readonly MergePath[]>;
  /** Array policies for `telecom` and `address`. Default `fill-empty-only` for both. */
  arrays?: Opt<ArrayPolicies>;
  /** Label stored on every change taken from the incoming record, e.g. `hie:example`. */
  source?: Opt<string>;
  /** Adds the incoming value to each change. Default false: no PHI in the change report. */
  includeValues?: Opt<boolean>;
}

export type ChangeAction =
  /** The local record had nothing here; the incoming value was written. */
  | 'filled'
  /** `append-new`: the local record had entries; new incoming ones were added after them. */
  | 'appended'
  /** Both had a value; the local one stays. */
  | 'kept-local'
  /** The path is protected; nothing was written. */
  | 'skipped-protected'
  /** The incoming value failed normalization or is a placeholder. */
  | 'skipped-invalid'
  /** The incoming value equals the local one after normalization. */
  | 'skipped-duplicate';

export interface Change {
  /** `birthDate`, `gender`, `name`, `address`, `telecom[system=phone]`, `telecom[system=email]`. */
  path: string;
  action: ChangeAction;
  /** Whose data the result holds for this path (`appended`: the added entries are incoming). */
  origin: 'local' | 'incoming';
  /** `MergeOptions.source`, on changes taken from the incoming record. */
  source?: string;
  /** On `appended`: how many incoming entries were added. */
  appended?: number;
  /** On `appended`: how many valid incoming entries were already in the local record. */
  duplicates?: number;
  /**
   * Only with `includeValues`: what was written (`filled`, `appended`), otherwise every valid
   * incoming value, or the incoming value as given when none is valid (at most 10 entries).
   */
  value?: unknown;
}

export type MergeResult<P extends PatientLike> =
  | { status: 'merged'; patient: P; changes: Change[]; match: MatchResult }
  | { status: 'refused'; patient: P; changes: []; match: MatchResult; reason: string };
