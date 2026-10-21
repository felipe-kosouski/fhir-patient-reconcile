import { type MatchContext, resolveContext } from '../match/context.js';
import { matchPatients } from '../match/match.js';
import { MAX_ENTRIES } from '../match/prepare.js';
import type { MatchOptions, MatchResult } from '../match/types.js';
import { type NormalizedAddress, normalizeAddress } from '../normalize/address.js';
import { normalizeBirthDate } from '../normalize/date.js';
import { normalizeEmail } from '../normalize/email.js';
import { normalizeName } from '../normalize/name.js';
import { strings } from '../normalize/text.js';
import type { AddressLike, ContactPointLike, HumanNameLike, PatientLike } from '../types/fhir.js';
import { objects, requireKnownKeys } from '../util/input.js';
import type {
  ArrayPolicies,
  ArrayPolicy,
  Change,
  MergeOptions,
  MergePath,
  MergeResult,
} from './types.js';

const KNOWN_OPTIONS: Readonly<Record<keyof MergeOptions, true>> = {
  match: true,
  matchOptions: true,
  require: true,
  policy: true,
  protectedPaths: true,
  arrays: true,
  source: true,
  includeValues: true,
};

const MERGE_PATHS: ReadonlySet<string> = new Set<MergePath>([
  'birthDate',
  'gender',
  'name',
  'telecom',
  'telecom.phone',
  'telecom.email',
  'address',
]);

const ARRAY_PATHS: Readonly<Record<keyof ArrayPolicies, true>> = { telecom: true, address: true };

/** Gender codes worth writing; `unknown` carries no information. */
const WRITABLE_GENDERS: ReadonlySet<string> = new Set(['male', 'female', 'other']);

/** The allowlisted fields of the copy that a merge writes. Nothing else is ever assigned. */
interface Writable {
  birthDate?: string;
  gender?: string;
  name?: unknown;
  telecom?: unknown;
  address?: unknown;
}

interface Settings {
  require: 'match' | 'possible';
  protectedPaths: ReadonlySet<string>;
  arrays: Required<{ [K in keyof ArrayPolicies]: ArrayPolicy }>;
  source: string | undefined;
  includeValues: boolean;
  matchOptions: MatchOptions | undefined;
}

/**
 * Copies demographic data from `incoming` into a copy of `local`, failing closed.
 *
 * - Runs `matchPatients` (with `matchOptions`) and merges only on `match`, or on `possible` when
 *   `require: 'possible'` is explicit. A veto always refuses. A `match` passed in is verified
 *   against that run: a stale or foreign result refuses instead of authorizing the merge.
 * - `fill-empty-only`: a field is written only when the local record has none. "None" means
 *   absent: a local placeholder, a partial date, or a `_birthDate` / `_gender` element (such as a
 *   data-absent-reason extension) counts as data and is kept.
 * - Only these paths can change: `birthDate`, `gender`, `name` (when local has no name),
 *   phones and emails in `telecom` (per system, when local has none of that system) and
 *   `address` (when local has none). Only valid incoming entries are copied, with their known
 *   fields; extensions and every other element of either record are left alone.
 * - `arrays: { telecom: 'append-new' }` (or `address`): when the local record already has
 *   entries there, new incoming ones are added after them. "New" means not already local after
 *   normalization (an address: same postal code and street line). Local entries never change.
 * - `protectedPaths` are never written.
 *
 * Never mutates its inputs and never removes data. A refused merge returns an unchanged copy of
 * `local`. The change report holds no patient values unless `includeValues` is set.
 *
 * @throws RangeError or TypeError for invalid options (see also `matchPatients`).
 */
export function mergePatient<P extends PatientLike>(
  local: P,
  incoming: PatientLike,
  options: MergeOptions = {},
): MergeResult<P> {
  const settings = resolveSettings(options);
  const match = matchPatients(local, incoming, settings.matchOptions);
  const patient = structuredClone(local);

  const refusal = refusalReason(options.match, match, settings.require);
  if (refusal !== undefined) {
    return { status: 'refused', patient, changes: [], match, reason: refusal };
  }

  const ctx = resolveContext(settings.matchOptions);
  const target = patient as unknown as Writable;
  const changes = [
    mergeBirthDate(target, local, incoming, settings),
    mergeGender(target, local, incoming, settings),
    mergeNames(target, local, incoming, settings),
    mergeTelecom(target, local, incoming, settings, 'phone', ctx),
    mergeTelecom(target, local, incoming, settings, 'email', ctx),
    mergeAddresses(target, local, incoming, settings),
  ].filter((change): change is Change => change !== undefined);
  return { status: 'merged', patient, changes, match };
}

function resolveSettings(options: MergeOptions): Settings {
  requireKnownKeys(options, KNOWN_OPTIONS, 'options');
  const { require = 'match', policy = 'fill-empty-only', protectedPaths = [], source } = options;
  if (require !== 'match' && require !== 'possible') {
    throw new RangeError(`require must be 'match' or 'possible', got ${String(require)}`);
  }
  if (policy !== 'fill-empty-only') {
    throw new RangeError(`policy must be 'fill-empty-only', got ${String(policy)}`);
  }
  if (!Array.isArray(protectedPaths)) throw new TypeError('protectedPaths must be an array');
  for (const path of protectedPaths) {
    if (!MERGE_PATHS.has(path)) {
      throw new RangeError(
        `unknown protected path ${String(path)} (expected one of: ${[...MERGE_PATHS].join(', ')})`,
      );
    }
  }
  const arrays = resolveArrays(options.arrays);
  if (source !== undefined && typeof source !== 'string') {
    throw new TypeError('source must be a string');
  }
  if (
    options.match !== undefined &&
    (typeof options.match !== 'object' || options.match === null)
  ) {
    throw new TypeError('match must be a result of matchPatients');
  }
  return {
    require,
    protectedPaths: new Set(protectedPaths),
    arrays,
    source,
    includeValues: options.includeValues === true,
    matchOptions: options.matchOptions,
  };
}

function resolveArrays(arrays: ArrayPolicies | undefined): Settings['arrays'] {
  if (arrays === undefined) return { telecom: 'fill-empty-only', address: 'fill-empty-only' };
  if (typeof arrays !== 'object' || arrays === null || Array.isArray(arrays)) {
    throw new TypeError('arrays must be an object');
  }
  requireKnownKeys(arrays, ARRAY_PATHS, 'arrays');
  const policy = (path: keyof ArrayPolicies): ArrayPolicy => {
    const value = arrays[path] ?? 'fill-empty-only';
    if (value !== 'fill-empty-only' && value !== 'append-new') {
      throw new RangeError(
        `arrays.${path} must be 'fill-empty-only' or 'append-new', got ${String(value)}`,
      );
    }
    return value;
  };
  return { telecom: policy('telecom'), address: policy('address') };
}

function refusalReason(
  given: MatchResult | undefined,
  match: MatchResult,
  require: 'match' | 'possible',
): string | undefined {
  if (given !== undefined && !sameResult(given, match)) {
    return 'the match result passed in was not computed for these patients and match options';
  }
  if (match.vetoes.length > 0) {
    return `a veto refuses the merge (${match.vetoes.map((v) => v.code).join(', ')})`;
  }
  if (match.decision === 'no-match') return 'the patients do not match';
  if (match.decision === 'possible' && require === 'match') {
    return "the decision is possible; merging needs match (pass require: 'possible' to accept it)";
  }
  return undefined;
}

/** The parts of a result that authorize a merge. The given result may come from anywhere. */
function sameResult(given: MatchResult, match: MatchResult): boolean {
  const vetoCodes = (r: MatchResult) =>
    (Array.isArray(r.vetoes) ? r.vetoes : [])
      .map((v) => v?.code)
      .sort()
      .join(',');
  return (
    given.decision === match.decision &&
    given.points === match.points &&
    given.matchGrade === match.matchGrade &&
    given.insufficientEvidence === match.insufficientEvidence &&
    given.thresholds?.match === match.thresholds.match &&
    given.thresholds?.possible === match.thresholds.possible &&
    vetoCodes(given) === vetoCodes(match)
  );
}

/** What the incoming record offers for one path. */
interface Offer<T> {
  /** The incoming record has something at this path (valid or not). */
  present: boolean;
  /** The value to write: valid, and (for lists) not already in the local record. */
  valid: T | undefined;
  /** Every valid incoming value is already in the local record (after normalization). */
  duplicate: boolean;
  /** The incoming value as given, for `includeValues`. */
  raw: unknown;
}

/**
 * The decision for one path, in order: nothing offered, protected, local has data (duplicate or
 * kept), invalid, written. Calls `write` only when it writes; `written` names that action
 * (`appended` when append-new adds to local entries, which then do not count as data here).
 */
function decide<T>(
  path: string,
  protectedBy: readonly MergePath[],
  localPresent: boolean,
  offer: Offer<T>,
  settings: Settings,
  write: (value: T) => void,
  written: 'filled' | 'appended' = 'filled',
): Change | undefined {
  if (!offer.present) return undefined;
  const change = (action: Change['action'], origin: Change['origin']): Change => {
    const result: Change = { path, action, origin };
    if (action === written && settings.source !== undefined) result.source = settings.source;
    if (settings.includeValues) result.value = offer.valid ?? offer.raw;
    return result;
  };
  if (protectedBy.some((p) => settings.protectedPaths.has(p))) {
    return change('skipped-protected', 'local');
  }
  if (localPresent) return change(offer.duplicate ? 'skipped-duplicate' : 'kept-local', 'local');
  if (offer.valid === undefined) return change('skipped-invalid', 'incoming');
  write(offer.valid);
  return change(written, 'incoming');
}

function mergeBirthDate(
  target: Writable,
  local: PatientLike,
  incoming: PatientLike,
  settings: Settings,
): Change | undefined {
  const valid = normalizeIncoming(incoming.birthDate, normalizeBirthDate)?.value;
  const offer: Offer<string> = {
    present: isSet(incoming.birthDate),
    valid,
    duplicate:
      valid !== undefined &&
      normalizeIncoming(local.birthDate, normalizeBirthDate)?.value === valid,
    raw: incoming.birthDate,
  };
  const localPresent = isSet(local.birthDate) || hasPrimitiveElement(local, '_birthDate');
  return decide('birthDate', ['birthDate'], localPresent, offer, settings, (value) => {
    target.birthDate = value;
  });
}

function mergeGender(
  target: Writable,
  local: PatientLike,
  incoming: PatientLike,
  settings: Settings,
): Change | undefined {
  const value = incoming.gender;
  const valid = typeof value === 'string' && WRITABLE_GENDERS.has(value) ? value : undefined;
  const offer: Offer<string> = {
    present: isSet(value),
    valid,
    duplicate: valid !== undefined && local.gender === valid,
    raw: value,
  };
  const localPresent = isSet(local.gender) || hasPrimitiveElement(local, '_gender');
  return decide('gender', ['gender'], localPresent, offer, settings, (v) => {
    target.gender = v;
  });
}

function mergeNames(
  target: Writable,
  local: PatientLike,
  incoming: PatientLike,
  settings: Settings,
): Change | undefined {
  return mergeList(
    {
      path: 'name',
      protectedBy: ['name'],
      policy: 'fill-empty-only', // names are never appended: two names are not more information
      local: local.name,
      incoming: objects(incoming.name),
      normalize: (n: HumanNameLike) => jsonOf(normalizeName(n)),
      copy: copyName,
      write: (added) => {
        target.name = appended(target.name, added);
      },
    },
    settings,
  );
}

function mergeTelecom(
  target: Writable,
  local: PatientLike,
  incoming: PatientLike,
  settings: Settings,
  system: 'phone' | 'email',
  ctx: MatchContext,
): Change | undefined {
  const ofSystem = (telecom: readonly ContactPointLike[]) =>
    telecom.filter((c) => c.system === system);
  return mergeList(
    {
      path: `telecom[system=${system}]`,
      protectedBy: ['telecom', system === 'phone' ? 'telecom.phone' : 'telecom.email'],
      policy: settings.arrays.telecom,
      // Entries of other systems are not data for this path; a non-array telecom is.
      local: Array.isArray(local.telecom) ? ofSystem(objects(local.telecom)) : local.telecom,
      incoming: ofSystem(objects(incoming.telecom)),
      normalize: ({ value }: ContactPointLike) => {
        if (typeof value !== 'string') return undefined;
        return system === 'phone' ? ctx.phone(value) : normalizeEmail(value);
      },
      copy: copyContactPoint,
      write: (added) => {
        target.telecom = appended(target.telecom, added);
      },
    },
    settings,
  );
}

function mergeAddresses(
  target: Writable,
  local: PatientLike,
  incoming: PatientLike,
  settings: Settings,
): Change | undefined {
  return mergeList(
    {
      path: 'address',
      protectedBy: ['address'],
      policy: settings.arrays.address,
      local: local.address,
      incoming: objects(incoming.address),
      normalize: normalizeAddress,
      same: sameAddress,
      copy: copyAddress,
      write: (added) => {
        target.address = appended(target.address, added);
      },
    },
    settings,
  );
}

/**
 * The same place for a merge: same postal code and street line. Without a postal code on one
 * side, the same line (or, with no line, the same city) and no city that differs. A near copy
 * that only adds or reformats a city or state is not new information.
 */
function sameAddress(a: NormalizedAddress, b: NormalizedAddress): boolean {
  if (a.country !== undefined && b.country !== undefined && a.country !== b.country) return false;
  if (a.line !== b.line) return false;
  if (a.postalCode !== undefined && b.postalCode !== undefined) {
    return a.postalCode === b.postalCode;
  }
  if (a.line === undefined) return a.city === b.city;
  return a.city === undefined || b.city === undefined || a.city === b.city;
}

/** One list path (names, phones, emails, addresses). */
interface ListPath<T extends object, N> {
  path: string;
  protectedBy: readonly MergePath[];
  policy: ArrayPolicy;
  /** The local value at this path, as stored: entries of this kind, or anything else. */
  local: unknown;
  incoming: readonly T[];
  /** The entry after normalization; `undefined` when it is unusable. */
  normalize: (entry: T) => N | undefined;
  /** When two normalized entries are the same. Default: `===` (a `Set` lookup). */
  same?: (a: N, b: N) => boolean;
  /** A fresh copy of the known fields; `undefined` when a field is too long. */
  copy: (entry: T) => T | undefined;
  /** Adds entries after the ones already there. */
  write: (entries: T[]) => void;
}

/**
 * The first `MAX_ENTRIES` valid incoming entries, distinct after normalization (the incoming
 * record is untrusted: 100,000 emails must not become 100,000 local entries), minus those
 * already in the local record. Local entries are only read, so the work is linear in their
 * number (times at most `MAX_ENTRIES` for a `same` function).
 */
function mergeList<T extends object, N>(
  spec: ListPath<T, N>,
  settings: Settings,
): Change | undefined {
  const same = spec.same ?? ((a: N, b: N) => a === b);
  const chosen: N[] = [];
  const copies: T[] = [];
  for (const entry of spec.incoming) {
    if (chosen.length === MAX_ENTRIES) break;
    const normalized = spec.normalize(entry);
    if (normalized === undefined || chosen.some((c) => same(c, normalized))) continue;
    const copy = spec.copy(entry);
    if (copy === undefined) continue;
    chosen.push(normalized);
    copies.push(copy);
  }

  const localEntries = Array.isArray(spec.local) ? objects<T>(spec.local) : [];
  const isLocal = membership(localEntries.map(spec.normalize), spec.same);
  const fresh = copies.filter((_, k) => !isLocal(chosen[k] as N));
  const offer: Offer<T[]> = {
    present: spec.incoming.length > 0,
    valid: fresh.length > 0 ? fresh : undefined,
    duplicate: copies.length > 0 && fresh.length === 0,
    // Echoed only with includeValues; bounded like the copies.
    raw: spec.incoming.slice(0, MAX_ENTRIES),
  };

  const localPresent = presentArray(spec.local);
  // append-new extends a local array; a local value that is not an array is kept as it is.
  const appending =
    localPresent && spec.policy === 'append-new' && Array.isArray(spec.local) && fresh.length > 0;
  const result = decide(
    spec.path,
    spec.protectedBy,
    localPresent && !appending,
    offer,
    settings,
    spec.write,
    appending ? 'appended' : 'filled',
  );
  if (result?.action === 'appended') {
    result.appended = fresh.length;
    result.duplicates = copies.length - fresh.length;
  }
  return result;
}

/** Membership among normalized local entries: a `Set` for `===`, a scan for `same`. */
function membership<N>(
  values: readonly (N | undefined)[],
  same: ((a: N, b: N) => boolean) | undefined,
): (value: N) => boolean {
  const known = values.filter((v): v is N => v !== undefined);
  if (same === undefined) {
    const set = new Set(known);
    return (value) => set.has(value);
  }
  return (value) => known.some((k) => same(k, value));
}

/** `current` (when it is an array) followed by `added`: a merge never drops what is there. */
function appended(current: unknown, added: readonly unknown[]): unknown[] {
  return [...(Array.isArray(current) ? current : []), ...added];
}

function jsonOf(value: object | undefined): string | undefined {
  return value === undefined ? undefined : JSON.stringify(value);
}

// --- reading and copying untrusted input ---

/**
 * Any value counts, whatever its type: fill-empty-only must never replace local data, even data
 * of the wrong type (a numeric birth date) or a blank string.
 */
function isSet(value: unknown): boolean {
  return value !== undefined && value !== null;
}

/** `_birthDate` / `_gender`: where FHIR JSON keeps a primitive's extensions. */
function hasPrimitiveElement(patient: PatientLike, key: string): boolean {
  return isSet((patient as unknown as Record<string, unknown>)[key]);
}

/** Any entry at all counts (fill-empty-only), and a non-array value is data too. */
function presentArray(value: unknown): boolean {
  return Array.isArray(value) ? value.some(isSet) : isSet(value);
}

function normalizeIncoming<T>(
  value: unknown,
  normalize: (v: string) => T | undefined,
): T | undefined {
  return typeof value === 'string' ? normalize(value) : undefined;
}

/** Longest text field copied from the incoming record; a longer one makes the entry invalid. */
const MAX_TEXT_LENGTH = 1_000;

/** Fresh objects with only trimmed string fields, so the result shares nothing with the input. */
function copyName(name: HumanNameLike): HumanNameLike | undefined {
  return pick(name, ['use', 'text', 'family'], ['given', 'prefix', 'suffix']);
}

function copyContactPoint(contact: ContactPointLike): ContactPointLike | undefined {
  return pick(contact, ['system', 'value', 'use'], []);
}

function copyAddress(address: AddressLike): AddressLike | undefined {
  return pick(
    address,
    ['use', 'type', 'text', 'city', 'district', 'state', 'postalCode', 'country'],
    ['line'],
  );
}

function pick<T extends object>(
  source: T,
  scalars: readonly string[],
  lists: readonly string[],
): T | undefined {
  const from = source as Record<string, unknown>;
  const copy: Record<string, unknown> = {};
  const usable = (values: readonly string[]) => values.map((v) => v.trim()).filter((v) => v !== '');
  for (const key of scalars) {
    const [value] = usable(strings([from[key]]));
    if (value === undefined) continue;
    if (value.length > MAX_TEXT_LENGTH) return undefined;
    copy[key] = value;
  }
  for (const key of lists) {
    const values = usable(strings(from[key]));
    if (values.some((v) => v.length > MAX_TEXT_LENGTH)) return undefined;
    if (values.length > 0) copy[key] = values;
  }
  return copy as T;
}
