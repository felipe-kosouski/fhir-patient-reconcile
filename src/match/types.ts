import type { PhoneCountry } from '../normalize/phone.js';

/** `T | undefined`, spelled out so optional options accept an explicit `undefined`. */
type Opt<T> = T | undefined;

/** The fields `matchPatients` compares, in the order results are reported. */
export type MatchField =
  | 'identifier'
  | 'family'
  | 'given'
  | 'middle'
  | 'birthDate'
  | 'phone'
  | 'email'
  | 'address'
  | 'gender';

/**
 * - `exact`: the values agree after normalization.
 * - `fuzzy`: near agreement (a typo, a swapped day and month, a shared postal code).
 * - `missing`: nothing to compare on one or both sides, or a value that can only disprove
 *   (a partial birth date that agrees). Never scored as a disagreement.
 * - `conflict`: both sides have usable values and they disagree.
 */
export type FieldOutcome = 'exact' | 'fuzzy' | 'missing' | 'conflict';

/** Points per outcome. `missing` always scores 0. */
export interface FieldWeights {
  exact: number;
  fuzzy: number;
  /** Usually negative. */
  conflict: number;
}

/** A partial `FieldWeights`; `undefined` keeps the default. */
export interface FieldWeightOverrides {
  exact?: Opt<number>;
  fuzzy?: Opt<number>;
  conflict?: Opt<number>;
}

export interface MatchOptions {
  /** Overrides merged over `DEFAULT_WEIGHTS`, field by field and outcome by outcome. */
  weights?: Opt<Partial<Record<MatchField, Opt<FieldWeightOverrides>>>>;
  /** Point thresholds, merged over `DEFAULT_THRESHOLDS`. `possible` must not exceed `match`. */
  thresholds?: Opt<{ match?: Opt<number>; possible?: Opt<number> }>;
  /** Country assumed for phone numbers without a country code. */
  defaultCountry?: Opt<PhoneCountry>;
  /**
   * Replaces the built-in Brazil/NANP phone parser for every phone: returns E.164 (or any
   * canonical string) for a usable number, `undefined` otherwise. Use it for other countries,
   * e.g. with libphonenumber-js. An empty result, or one whose last 8 digits are one repeated
   * digit (a placeholder such as 99999-9999), is treated as unusable.
   */
  normalizePhone?: Opt<(value: string) => string | undefined>;
  /**
   * Identifier systems allowed to score and to veto. Replaces the default list, which holds only
   * the RNDS CPF system. Values from the RNDS CPF system get check-digit validation.
   */
  identifierSystems?: Opt<{ trusted?: Opt<readonly string[]> }>;
  /** Jaro-Winkler cut-off for a fuzzy name agreement. Default 0.92. */
  nameSimilarity?: Opt<{ fuzzyMin?: Opt<number> }>;
  /** Adds the normalized values to each field result. Default false: no PHI in explanations. */
  includeValues?: Opt<boolean>;
}

export interface FieldResult {
  field: MatchField;
  outcome: FieldOutcome;
  points: number;
  /** Human-readable; never contains patient values. */
  reason: string;
  /** Normalized local value(s), only with `includeValues`. */
  local?: string;
  /** Normalized incoming value(s), only with `includeValues`. */
  incoming?: string;
  /** Jaro-Winkler similarity (0..1) when a fuzzy name comparison ran. */
  similarity?: number;
}

export type MatchDecision = 'match' | 'possible' | 'no-match';

/** FHIR `match-grade` extension vocabulary, as used by `Patient/$match`. */
export type FhirMatchGrade = 'certain' | 'probable' | 'possible' | 'certainly-not';

export interface MatchThresholds {
  match: number;
  possible: number;
}

export interface Veto {
  code: 'identifier-conflict' | 'generational-suffix-conflict' | 'birthdate-conflict';
  /** Human-readable; never contains patient values. */
  reason: string;
}

export interface MatchResult {
  decision: MatchDecision;
  /** `null` when `Patient/$match` would not return the candidate at all (no-match, no veto). */
  matchGrade: FhirMatchGrade | null;
  /** 0..1, for ranking candidates. Not a probability. */
  score: number;
  points: number;
  thresholds: MatchThresholds;
  /** One result per field, in `MatchField` order. */
  fields: FieldResult[];
  vetoes: Veto[];
  /**
   * True when given name, family name, birth date and one of identifier, phone, email or address
   * do not all agree, or the middle names conflict: the decision is then never `match`, whatever
   * the points. (`possible` separately needs one agreeing field besides the name.)
   */
  insufficientEvidence: boolean;
}
