import type { FieldWeights, MatchField, MatchThresholds } from './types.js';

/**
 * Starting points per field and outcome, from the v0.1 plan. They are a heuristic, not a
 * calibrated model, and will be tuned against the hard-case table.
 *
 * - Identifiers score only from trusted systems; a conflict there also vetoes.
 * - Phones and emails are shared by families and change, so a conflict costs little.
 * - A missing middle name never penalizes, and gender does not score at all (often miscoded,
 *   and it can change).
 */
export const DEFAULT_WEIGHTS: Readonly<Record<MatchField, Readonly<FieldWeights>>> = freezeAll({
  identifier: { exact: 10, fuzzy: 0, conflict: -10 },
  family: { exact: 4, fuzzy: 2, conflict: -3 },
  given: { exact: 4, fuzzy: 2, conflict: -3 },
  middle: { exact: 1, fuzzy: 0.5, conflict: 0 },
  birthDate: { exact: 5, fuzzy: 2, conflict: -6 },
  phone: { exact: 4, fuzzy: 0, conflict: -1 },
  email: { exact: 4, fuzzy: 0, conflict: -1 },
  address: { exact: 3, fuzzy: 1, conflict: -1 },
  gender: { exact: 0, fuzzy: 0, conflict: 0 },
});

/** Default Jaro-Winkler cut-off for a fuzzy name agreement. */
export const DEFAULT_NAME_FUZZY_MIN = 0.92;

/**
 * Points needed for each decision. `match` also needs sufficient evidence and no veto. A
 * `possible` with sufficient evidence and no veto, at or above the midpoint between the two, is
 * FHIR `probable`.
 */
export const DEFAULT_THRESHOLDS: Readonly<MatchThresholds> = Object.freeze({
  match: 14,
  possible: 8,
});

/**
 * The defaults are shared by every caller in the process: frozen, so `DEFAULT_WEIGHTS.given.exact
 * = 100` throws (strict mode) instead of silently changing everyone's results.
 */
function freezeAll<T extends Record<string, object>>(table: T): Readonly<T> {
  for (const row of Object.values(table)) Object.freeze(row);
  return Object.freeze(table);
}
