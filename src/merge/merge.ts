import { type MatchContext, resolveContext } from '../match/context.js';
import { matchPatients } from '../match/match.js';
import { MAX_ENTRIES } from '../match/prepare.js';
import type { MatchOptions, MatchResult } from '../match/types.js';
import { normalizeAddress } from '../normalize/address.js';
import { normalizeBirthDate } from '../normalize/date.js';
import { normalizeEmail } from '../normalize/email.js';
import { normalizeName } from '../normalize/name.js';
import { strings } from '../normalize/text.js';
import type { AddressLike, ContactPointLike, HumanNameLike, PatientLike } from '../types/fhir.js';
import { objects, requireKnownKeys } from '../util/input.js';
import type { Change, MergeOptions, MergePath, MergeResult } from './types.js';

const KNOWN_OPTIONS: Readonly<Record<keyof MergeOptions, true>> = {
  match: true,
  matchOptions: true,
  require: true,
  policy: true,
  protectedPaths: true,
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

/** Gender codes worth writing; `unknown` carries no information. */
const WRITABLE_GENDERS: ReadonlySet<string> = new Set(['male', 'female', 'other']);

/** The allowlisted fields of the copy that a merge writes. Nothing else is ever assigned. */
interface Writable {
  birthDate?: string;
  gender?: string;
  name?: HumanNameLike[];
  telecom?: unknown;
  address?: AddressLike[];
}

interface Settings {
  require: 'match' | 'possible';
  protectedPaths: ReadonlySet<string>;
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
    source,
    includeValues: options.includeValues === true,
    matchOptions: options.matchOptions,
  };
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
  /** The value to write, when the incoming one is valid. */
  valid: T | undefined;
  /** The valid incoming value is already in the local record (after normalization). */
  duplicate: boolean;
  /** The incoming value as given, for `includeValues`. */
  raw: unknown;
}

/**
 * The fill-empty-only decision for one path, in order: nothing offered, protected, local has
 * data (duplicate or kept), invalid, filled. Calls `write` only for `filled`.
 */
function decide<T>(
  path: string,
  protectedBy: readonly MergePath[],
  localPresent: boolean,
  offer: Offer<T>,
  settings: Settings,
  write: (value: T) => void,
): Change | undefined {
  if (!offer.present) return undefined;
  const change = (action: Change['action'], origin: Change['origin']): Change => {
    const result: Change = { path, action, origin };
    if (action === 'filled' && settings.source !== undefined) result.source = settings.source;
    if (settings.includeValues) result.value = offer.valid ?? offer.raw;
    return result;
  };
  if (protectedBy.some((p) => settings.protectedPaths.has(p))) {
    return change('skipped-protected', 'local');
  }
  if (localPresent) return change(offer.duplicate ? 'skipped-duplicate' : 'kept-local', 'local');
  if (offer.valid === undefined) return change('skipped-invalid', 'incoming');
  write(offer.valid);
  return change('filled', 'incoming');
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
  const key = (n: HumanNameLike) => {
    const normalized = normalizeName(n);
    return normalized === undefined ? undefined : JSON.stringify(normalized);
  };
  return mergeList(
    {
      path: 'name',
      protectedBy: ['name'],
      local: objects(local.name),
      localPresent: presentArray(local.name),
      incoming: objects(incoming.name),
      key,
      copy: copyName,
      write: (names) => {
        target.name = names;
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
  const ofSystem = (telecom: PatientLike['telecom']) =>
    objects(telecom).filter((c) => c.system === system);
  const key = ({ value }: ContactPointLike) => {
    if (typeof value !== 'string') return undefined;
    return system === 'phone' ? ctx.phone(value) : normalizeEmail(value);
  };
  return mergeList(
    {
      path: `telecom[system=${system}]`,
      protectedBy: ['telecom', system === 'phone' ? 'telecom.phone' : 'telecom.email'],
      local: ofSystem(local.telecom),
      // A local telecom that is not an array is data we cannot extend without replacing it.
      localPresent:
        ofSystem(local.telecom).length > 0 ||
        (local.telecom !== undefined && !Array.isArray(local.telecom)),
      incoming: ofSystem(incoming.telecom),
      key,
      copy: copyContactPoint,
      write: (added) => {
        const current = Array.isArray(target.telecom) ? (target.telecom as unknown[]) : [];
        target.telecom = [...current, ...added];
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
  const key = (a: AddressLike) => {
    const normalized = normalizeAddress(a);
    return normalized === undefined ? undefined : JSON.stringify(normalized);
  };
  return mergeList(
    {
      path: 'address',
      protectedBy: ['address'],
      local: objects(local.address),
      localPresent: presentArray(local.address),
      incoming: objects(incoming.address),
      key,
      copy: copyAddress,
      write: (addresses) => {
        target.address = addresses;
      },
    },
    settings,
  );
}

/** One list path (names, phones, emails, addresses) of a fill-empty-only merge. */
interface ListPath<T extends object> {
  path: string;
  protectedBy: readonly MergePath[];
  /** Local entries of this kind, for duplicate detection. */
  local: readonly T[];
  /** The local record has data here (fill-empty-only never writes then). */
  localPresent: boolean;
  incoming: readonly T[];
  /** Identity after normalization; `undefined` when the entry is unusable. */
  key: (entry: T) => string | undefined;
  /** A fresh copy of the known fields; `undefined` when a field is too long. */
  copy: (entry: T) => T | undefined;
  write: (entries: T[]) => void;
}

/**
 * Valid incoming entries, distinct after normalization and at most `MAX_ENTRIES` (the incoming
 * record is untrusted: 100,000 emails must not become 100,000 local entries).
 */
function mergeList<T extends object>(spec: ListPath<T>, settings: Settings): Change | undefined {
  const keys = new Set<string>();
  const valid: T[] = [];
  for (const entry of spec.incoming) {
    if (valid.length === MAX_ENTRIES) break;
    const key = spec.key(entry);
    if (key === undefined || keys.has(key)) continue;
    const copy = spec.copy(entry);
    if (copy === undefined) continue;
    keys.add(key);
    valid.push(copy);
  }
  const localKeys = new Set(spec.local.map(spec.key));
  const offer: Offer<T[]> = {
    present: spec.incoming.length > 0,
    valid: valid.length > 0 ? valid : undefined,
    duplicate: valid.length > 0 && [...keys].every((key) => localKeys.has(key)),
    // Echoed only with includeValues; bounded like the copies.
    raw: spec.incoming.slice(0, MAX_ENTRIES),
  };
  return decide(spec.path, spec.protectedBy, spec.localPresent, offer, settings, spec.write);
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
