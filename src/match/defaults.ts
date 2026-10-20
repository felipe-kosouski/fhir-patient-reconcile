import type { FieldWeights, MatchField } from './types.js';

/**
 * Starting points per field and outcome, from the v0.1 plan. They are a heuristic, not a
 * calibrated model, and will be tuned against the hard-case table.
 *
 * - Identifiers score only from trusted systems; a conflict there also vetoes.
 * - Phones and emails are shared by families and change, so a conflict costs little.
 * - A missing middle name never penalizes, and gender does not score at all (often miscoded,
 *   and it can change).
 */
export const DEFAULT_WEIGHTS: Readonly<Record<MatchField, Readonly<FieldWeights>>> = {
  identifier: { exact: 10, fuzzy: 0, conflict: -10 },
  family: { exact: 4, fuzzy: 2, conflict: -3 },
  given: { exact: 4, fuzzy: 2, conflict: -3 },
  middle: { exact: 1, fuzzy: 0.5, conflict: 0 },
  birthDate: { exact: 5, fuzzy: 2, conflict: -6 },
  phone: { exact: 4, fuzzy: 0, conflict: -1 },
  email: { exact: 4, fuzzy: 0, conflict: -1 },
  address: { exact: 3, fuzzy: 1, conflict: -1 },
  gender: { exact: 0, fuzzy: 0, conflict: 0 },
};

/** Default Jaro-Winkler cut-off for a fuzzy name agreement. */
export const DEFAULT_NAME_FUZZY_MIN = 0.92;
