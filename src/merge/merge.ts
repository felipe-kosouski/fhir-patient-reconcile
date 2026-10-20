import { type MatchContext, resolveContext } from '../match/context.js';
import { matchPatients } from '../match/match.js';
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
  if (refusal !== undefined)
    return { status: 'refused', patient, changes: [], match, reason: refusal };

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
  if (source !== undefined && typeof source !== 'string')
    throw new TypeError('source must be a string');
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
    present: hasText(incoming.birthDate),
    valid,
    duplicate:
      valid !== undefined &&
      normalizeIncoming(local.birthDate, normalizeBirthDate)?.value === valid,
    raw: incoming.birthDate,
  };
  const localPresent = hasText(local.birthDate) || hasPrimitiveElement(local, '_birthDate');
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
    present: hasText(value),
    valid,
    duplicate: valid !== undefined && local.gender === valid,
    raw: value,
  };
  const localPresent = hasText(local.gender) || hasPrimitiveElement(local, '_gender');
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
  const entries = objects(incoming.name);
  const valid = distinctCopies(entries.filter((n) => normalizeName(n) !== undefined).map(copyName));
  const key = (n: HumanNameLike) => JSON.stringify(normalizeName(n) ?? null);
  const localKeys = new Set(objects(local.name).map(key));
  const offer: Offer<HumanNameLike[]> = {
    present: entries.length > 0,
    valid: valid.length > 0 ? valid : undefined,
    duplicate: valid.length > 0 && valid.every((n) => localKeys.has(key(n))),
    raw: incoming.name,
  };
  return decide('name', ['name'], presentArray(local.name), offer, settings, (names) => {
    target.name = names;
  });
}

function mergeTelecom(
  target: Writable,
  local: PatientLike,
  incoming: PatientLike,
  settings: Settings,
  system: 'phone' | 'email',
  ctx: MatchContext,
): Change | undefined {
  const normalize = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    return system === 'phone' ? ctx.phone(value) : normalizeEmail(value);
  };
  const ofSystem = (telecom: PatientLike['telecom']) =>
    objects(telecom).filter((c) => c.system === system);
  const entries = ofSystem(incoming.telecom);
  const seen = new Set<string>();
  const valid: ContactPointLike[] = [];
  for (const entry of entries) {
    const normalized = normalize(entry.value);
    if (normalized === undefined || seen.has(normalized)) continue;
    seen.add(normalized);
    valid.push(copyContactPoint(entry));
  }
  const localValues = new Set(ofSystem(local.telecom).map((c) => normalize(c.value)));
  const offer: Offer<ContactPointLike[]> = {
    present: entries.length > 0,
    valid: valid.length > 0 ? valid : undefined,
    duplicate: valid.length > 0 && [...seen].every((v) => localValues.has(v)),
    raw: entries,
  };
  // A local telecom that is not an array is data we cannot extend without replacing it.
  const localPresent =
    ofSystem(local.telecom).length > 0 ||
    (local.telecom !== undefined && !Array.isArray(local.telecom));
  const protectedBy: MergePath[] = [
    'telecom',
    system === 'phone' ? 'telecom.phone' : 'telecom.email',
  ];
  return decide(
    `telecom[system=${system}]`,
    protectedBy,
    localPresent,
    offer,
    settings,
    (added) => {
      const current = Array.isArray(target.telecom) ? (target.telecom as unknown[]) : [];
      target.telecom = [...current, ...added];
    },
  );
}

function mergeAddresses(
  target: Writable,
  local: PatientLike,
  incoming: PatientLike,
  settings: Settings,
): Change | undefined {
  const entries = objects(incoming.address);
  const valid = distinctCopies(
    entries.filter((a) => normalizeAddress(a) !== undefined).map(copyAddress),
  );
  const key = (a: AddressLike) => JSON.stringify(normalizeAddress(a) ?? null);
  const localKeys = new Set(objects(local.address).map(key));
  const offer: Offer<AddressLike[]> = {
    present: entries.length > 0,
    valid: valid.length > 0 ? valid : undefined,
    duplicate: valid.length > 0 && valid.every((a) => localKeys.has(key(a))),
    raw: incoming.address,
  };
  return decide('address', ['address'], presentArray(local.address), offer, settings, (list) => {
    target.address = list;
  });
}

// --- reading and copying untrusted input ---

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

/** `_birthDate` / `_gender`: FHIR JSON keeps extensions of a primitive (data-absent-reason) here. */
function hasPrimitiveElement(patient: PatientLike, key: string): boolean {
  const value = (patient as unknown as Record<string, unknown>)[key];
  return value !== undefined && value !== null;
}

/** Any entry at all counts (fill-empty-only), and a non-array value is data too. */
function presentArray(value: unknown): boolean {
  return Array.isArray(value)
    ? value.some((v) => v !== null && v !== undefined)
    : value !== undefined && value !== null;
}

function normalizeIncoming<T>(
  value: unknown,
  normalize: (v: string) => T | undefined,
): T | undefined {
  return typeof value === 'string' ? normalize(value) : undefined;
}

/** Fresh objects with only string fields, so the result shares nothing with the input. */
function copyName(name: HumanNameLike): HumanNameLike {
  return pick(name, ['use', 'text', 'family'], ['given', 'prefix', 'suffix']);
}

function copyContactPoint(contact: ContactPointLike): ContactPointLike {
  return pick(contact, ['system', 'value', 'use'], []);
}

function copyAddress(address: AddressLike): AddressLike {
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
): T {
  const from = source as Record<string, unknown>;
  const copy: Record<string, unknown> = {};
  for (const key of scalars) {
    const value = from[key];
    if (typeof value === 'string' && value.trim() !== '') copy[key] = value.trim();
  }
  for (const key of lists) {
    const values = strings(from[key]).filter((v) => v.trim() !== '');
    if (values.length > 0) copy[key] = values;
  }
  return copy as T;
}

function distinctCopies<T>(values: readonly T[]): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = JSON.stringify(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
