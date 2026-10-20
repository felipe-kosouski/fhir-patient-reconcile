import { type NormalizedAddress, normalizeAddress } from '../normalize/address.js';
import { normalizeCpf, RNDS_CPF_SYSTEM } from '../normalize/cpf.js';
import { type NormalizedBirthDate, normalizeBirthDate } from '../normalize/date.js';
import { normalizeEmail } from '../normalize/email.js';
import { type NormalizedName, normalizeName } from '../normalize/name.js';
import type { PatientLike } from '../types/fhir.js';
import type { MatchContext } from './context.js';

/** A patient with every compared field normalized once. Unusable values are left out. */
export interface PreparedPatient {
  birthDate: NormalizedBirthDate | undefined;
  /** Distinct, in input order, at most `MAX_ENTRIES`. */
  names: readonly NormalizedName[];
  /** Distinct, in input order. */
  phones: ReadonlySet<string>;
  emails: ReadonlySet<string>;
  /** Distinct, in input order, at most `MAX_ENTRIES`. */
  addresses: readonly NormalizedAddress[];
  /** Trusted systems only: system -> distinct values. */
  identifiers: ReadonlyMap<string, ReadonlySet<string>>;
  /** `unknown` counts as missing. */
  gender: string | undefined;
}

/**
 * At most this many distinct names and addresses per patient are compared. Best-pair matching
 * costs local x incoming, and the incoming record is untrusted; real records have a handful.
 */
export const MAX_ENTRIES = 10;

/** Contact point systems that carry phone numbers. */
const PHONE_SYSTEMS: ReadonlySet<string> = new Set(['phone', 'sms']);

export function preparePatient(patient: PatientLike, ctx: MatchContext): PreparedPatient {
  const telecom = patient.telecom ?? [];
  const phones = telecom
    .filter((c) => PHONE_SYSTEMS.has(c.system ?? ''))
    // A custom normalizer returning '' means "unusable" too.
    .map((c) => (c.value === undefined ? undefined : ctx.phone(c.value) || undefined));
  const emails = telecom
    .filter((c) => c.system === 'email')
    .map((c) => (c.value === undefined ? undefined : normalizeEmail(c.value)));

  const identifiers = new Map<string, Set<string>>();
  for (const { system, value } of patient.identifier ?? []) {
    if (system === undefined || value === undefined || !ctx.trustedSystems.has(system)) continue;
    const normalized = normalizeIdentifier(system, value);
    if (normalized === undefined) continue;
    const values = identifiers.get(system) ?? new Set();
    values.add(normalized);
    identifiers.set(system, values);
  }

  return {
    names: distinct(defined((patient.name ?? []).map(normalizeName))).slice(0, MAX_ENTRIES),
    birthDate: patient.birthDate === undefined ? undefined : normalizeBirthDate(patient.birthDate),
    phones: new Set(defined(phones)),
    emails: new Set(defined(emails)),
    addresses: distinct(defined((patient.address ?? []).map(normalizeAddress))).slice(
      0,
      MAX_ENTRIES,
    ),
    identifiers,
    gender: patient.gender === 'unknown' ? undefined : patient.gender,
  };
}

/** CPFs get check-digit and placeholder validation; other systems compare trimmed values. */
function normalizeIdentifier(system: string, value: string): string | undefined {
  if (system === RNDS_CPF_SYSTEM) return normalizeCpf(value);
  const trimmed = value.normalize('NFKC').trim();
  return trimmed === '' ? undefined : trimmed;
}

function defined<T>(values: readonly (T | undefined)[]): T[] {
  return values.filter((v): v is T => v !== undefined);
}

/** Drops structurally equal values (e.g. an `official` and a `usual` name that normalize alike). */
function distinct<T>(values: readonly T[]): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = JSON.stringify(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
