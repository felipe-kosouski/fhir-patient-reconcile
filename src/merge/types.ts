import type { MatchOptions, MatchResult } from '../match/types.js';
import type { PatientLike } from '../types/fhir.js';

/** `T | undefined`, spelled out so optional options accept an explicit `undefined`. */
type Opt<T> = T | undefined;

/** The only merge policy in v0.1: a value is written only where the local record has none. */
export type MergePolicy = 'fill-empty-only';

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
  /** Paths a human confirmed or edited: never written. */
  protectedPaths?: Opt<readonly MergePath[]>;
  /** Label stored on every change taken from the incoming record, e.g. `hie:example`. */
  source?: Opt<string>;
  /** Adds the incoming value to each change. Default false: no PHI in the change report. */
  includeValues?: Opt<boolean>;
}

export type ChangeAction =
  /** The local record had nothing here; the incoming value was written. */
  | 'filled'
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
  /** Whose data the result holds for this path. */
  origin: 'local' | 'incoming';
  /** `MergeOptions.source`, on changes taken from the incoming record. */
  source?: string;
  /** The incoming value the change is about, only with `includeValues`. */
  value?: unknown;
}

export type MergeResult<P extends PatientLike> =
  | { status: 'merged'; patient: P; changes: Change[]; match: MatchResult }
  | { status: 'refused'; patient: P; changes: []; match: MatchResult; reason: string };
