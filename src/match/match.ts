import type { PatientLike } from '../types/fhir.js';
import { compareFields } from './compare/index.js';
import type {
  FhirMatchGrade,
  FieldOutcome,
  MatchDecision,
  MatchField,
  MatchOptions,
  MatchResult,
  MatchThresholds,
  Veto,
} from './types.js';

const AGREES: ReadonlySet<FieldOutcome> = new Set(['exact', 'fuzzy']);

/** Fields that can corroborate name and birth date for a `match`. */
const CORROBORATING: readonly MatchField[] = ['identifier', 'phone', 'email', 'address'];

/** Fields other than the name that can make a pair worth reviewing. Gender does not score. */
const BEYOND_NAME: readonly MatchField[] = ['birthDate', ...CORROBORATING];

/**
 * Compares two patients field by field and decides whether they are the same person.
 *
 * - `points` is the sum of every field's points; `score` is `points` divided by the most points
 *   the configured weights allow, clamped to 0..1. It ranks candidates and is not a probability.
 * - `match` needs `points >= thresholds.match`, no veto, and sufficient evidence: given and family
 *   names, birth date, and one of identifier, phone, email or address must all agree (exact or
 *   fuzzy), and the middle names must not conflict (twins often share a compound first name).
 * - `possible` needs `points >= thresholds.possible`, no veto, and one agreeing field besides
 *   the name (birth date, identifier, phone, email or address): a shared name alone identifies
 *   nobody.
 * - Vetoes (decision `no-match`, grade `certainly-not`): two different trusted identifiers;
 *   generational suffixes of different generations; birth dates in different years.
 * - An equal trusted identifier always makes the decision at least `possible`, even with a veto:
 *   a shared CPF between two records needs a human look. With a veto, the grade is `possible`.
 * - `matchGrade` follows the FHIR `match-grade` vocabulary: `match` is `certain`; `possible` is
 *   `probable` only with sufficient evidence, no veto and points at or above the midpoint between
 *   the thresholds, otherwise `possible`; `no-match` with a veto is `certainly-not`, without one
 *   `null` (`$match` would not return it).
 *
 * Symmetric: swapping `local` and `incoming` gives the same decision, points and vetoes. Inputs
 * are never mutated, and explanations hold no patient values unless `includeValues` is set.
 *
 * @throws RangeError or TypeError for invalid options: non-finite weights or thresholds,
 * `fuzzyMin` outside 0..1, `thresholds.possible` above `thresholds.match`, unknown option names,
 * an unsupported `defaultCountry`, or options of the wrong type.
 */
export function matchPatients(
  local: PatientLike,
  incoming: PatientLike,
  options?: MatchOptions,
): MatchResult {
  const { fields, suffixConflict, birthYearsDiffer, ctx } = compareFields(local, incoming, options);
  const outcomes = new Map(fields.map((r) => [r.field, r.outcome]));
  const outcome = (field: MatchField): FieldOutcome => outcomes.get(field) ?? 'missing';
  const agrees = (field: MatchField) => AGREES.has(outcome(field));

  const vetoes: Veto[] = [];
  if (outcome('identifier') === 'conflict') {
    vetoes.push({
      code: 'identifier-conflict',
      reason: 'two different identifiers from a trusted system',
    });
  }
  if (suffixConflict) {
    vetoes.push({
      code: 'generational-suffix-conflict',
      reason: 'generational suffixes name different generations',
    });
  }
  if (outcome('birthDate') === 'conflict' && birthYearsDiffer) {
    vetoes.push({ code: 'birthdate-conflict', reason: 'birth dates are in different years' });
  }

  const points = roundPoints(fields.reduce((total, r) => total + r.points, 0));
  // A middle-name conflict means the given names disagree after the first one: twins often share
  // a compound first name (Maria Clara / Maria Eduarda). A missing middle name never blocks.
  const givenAgrees = agrees('given') && outcome('middle') !== 'conflict';
  const insufficientEvidence = !(
    givenAgrees &&
    agrees('family') &&
    agrees('birthDate') &&
    CORROBORATING.some(agrees)
  );
  const { thresholds } = ctx;
  let decision: MatchDecision = 'no-match';
  if (vetoes.length === 0) {
    if (points >= thresholds.match && !insufficientEvidence) decision = 'match';
    else if (points >= thresholds.possible && BEYOND_NAME.some(agrees)) decision = 'possible';
  }
  if (decision === 'no-match' && outcome('identifier') === 'exact') decision = 'possible';

  const maxPoints = Object.values(ctx.weights).reduce(
    (total, w) => total + Math.max(0, w.exact),
    0,
  );
  return {
    decision,
    matchGrade: grade(decision, points, thresholds, vetoes.length > 0, insufficientEvidence),
    score: maxPoints > 0 ? clamp(points / maxPoints) : 0,
    points,
    thresholds: { ...thresholds },
    fields,
    vetoes,
    insufficientEvidence,
  };
}

/**
 * FHIR defines `probable` as "a close match… review may be required" and `possible` as "review
 * SHOULD be performed". So `probable` is only for a pair where everything required agrees and
 * the points fall just short of a match. A vetoed pair (lifted by an equal identifier) and a pair
 * without sufficient evidence (twins, a replaced surname, name and birth date only) are
 * `possible`, however many points they have.
 */
function grade(
  decision: MatchDecision,
  points: number,
  thresholds: MatchThresholds,
  vetoed: boolean,
  insufficientEvidence: boolean,
): FhirMatchGrade | null {
  if (decision === 'match') return 'certain';
  if (decision === 'possible') {
    if (vetoed || insufficientEvidence) return 'possible';
    return points >= (thresholds.match + thresholds.possible) / 2 ? 'probable' : 'possible';
  }
  return vetoed ? 'certainly-not' : null;
}

/**
 * Weights like 0.7 + 0.1 add up to 0.7999999999999999 in floating point, which would miss a
 * threshold of 0.8. Points are rounded to 9 decimals, far below any meaningful weight.
 */
function roundPoints(points: number): number {
  return Math.round(points * 1e9) / 1e9;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
