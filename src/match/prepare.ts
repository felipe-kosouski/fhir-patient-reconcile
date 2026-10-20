import { type NormalizedAddress, normalizeAddress } from '../normalize/address.js';
import { normalizeCpf, RNDS_CPF_SYSTEM } from '../normalize/cpf.js';
import { type NormalizedBirthDate, normalizeBirthDate } from '../normalize/date.js';
import { normalizeEmail } from '../normalize/email.js';
import { type NormalizedName, normalizeName } from '../normalize/name.js';
import type { PatientLike } from '../types/fhir.js';
import type { MatchContext } from './context.js';

/** A patient with every compared field normalized once. Unusable values are left out. */
export interface PreparedPatient {
  names: readonly NormalizedName[];
  birthDate: NormalizedBirthDate | undefined;
  /** Unique, in input order. */
  phones: readonly string[];
  emails: readonly string[];
  addresses: readonly NormalizedAddress[];
  /** Trusted systems only: system -> unique values. */
  identifiers: ReadonlyMap<string, readonly string[]>;
  /** `unknown` counts as missing. */
  gender: string | undefined;
}

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

  const identifiers = new Map<string, string[]>();
  for (const { system, value } of patient.identifier ?? []) {
    if (system === undefined || value === undefined || !ctx.trustedSystems.has(system)) continue;
    const normalized = normalizeIdentifier(system, value);
    if (normalized === undefined) continue;
    const values = identifiers.get(system) ?? [];
    if (!values.includes(normalized)) values.push(normalized);
    identifiers.set(system, values);
  }

  return {
    names: defined((patient.name ?? []).map(normalizeName)),
    birthDate: patient.birthDate === undefined ? undefined : normalizeBirthDate(patient.birthDate),
    phones: unique(defined(phones)),
    emails: unique(defined(emails)),
    addresses: defined((patient.address ?? []).map(normalizeAddress)),
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

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
