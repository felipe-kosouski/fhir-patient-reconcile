import type { NormalizedName } from '../../normalize/name.js';
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
  /** The name pair the name results come from (for the generational-suffix veto). */
  namePair?: readonly [NormalizedName, NormalizedName];
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
  const comparison: FieldComparison = {
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
    ctx,
  };
  if (names.pair !== undefined) comparison.namePair = names.pair;
  return comparison;
}
