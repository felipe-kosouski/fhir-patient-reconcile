import type { PatientLike } from '../../types/fhir.js';
import { type MatchContext, resolveContext } from '../context.js';
import { preparePatient } from '../prepare.js';
import type { FieldResult, MatchOptions } from '../types.js';
import { compareAddresses } from './address.js';
import { compareBirthDate } from './birth-date.js';
import { compareContacts, compareGender, compareIdentifiers } from './contacts.js';
import { compareNames } from './names.js';

export interface FieldComparison {
  /** One result per field, in `MatchField` order. */
  fields: FieldResult[];
  /** The chosen name pair carries different generations (for the suffix veto). */
  suffixConflict: boolean;
  /** Both birth dates are usable and their years differ (for the birth-date veto). */
  birthYearsDiffer: boolean;
  ctx: MatchContext;
}

/** Runs every per-field comparator on a pair of patients. Inputs are never mutated. */
export function compareFields(
  local: PatientLike,
  incoming: PatientLike,
  options?: MatchOptions,
): FieldComparison {
  const ctx = resolveContext(options);
  const a = preparePatient(local, ctx);
  const b = preparePatient(incoming, ctx);
  const names = compareNames(a.names, b.names, ctx);
  return {
    fields: [
      compareIdentifiers(a.identifiers, b.identifiers, ctx),
      names.family,
      names.given,
      names.middle,
      compareBirthDate(a.birthDate, b.birthDate, ctx),
      compareContacts('phone', a.phones, b.phones, ctx),
      compareContacts('email', a.emails, b.emails, ctx),
      compareAddresses(a.addresses, b.addresses, ctx),
      compareGender(a.gender, b.gender, ctx),
    ],
    suffixConflict: names.suffixConflict,
    birthYearsDiffer:
      a.birthDate !== undefined &&
      b.birthDate !== undefined &&
      a.birthDate.year !== b.birthDate.year,
    ctx,
  };
}
