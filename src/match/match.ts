import type { PatientLike } from '../types/fhir.js';
import { compareFields } from './compare/index.js';
import type {
  FhirMatchGrade,
  FieldOutcome,
  FieldResult,
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

/**
 * Compares two patients field by field and decides whether they are the same person.
 *
 * - `points` is the sum of every field's points; `score` is `points` divided by the most points
 *   the configured weights allow, clamped to 0..1. It ranks candidates and is not a probability.
 * - `match` needs `points >= thresholds.match`, no veto, and sufficient evidence: given and family
 *   names, birth date, and one of identifier, phone, email or address must all agree (exact or
 *   fuzzy). `possible` needs `points >= thresholds.possible` and no veto.
 * - Vetoes (decision `no-match`, grade `certainly-not`): two different trusted identifiers;
 *   generational suffixes of different generations; birth dates in different years.
 * - An equal trusted identifier always makes the decision at least `possible`, even with a veto:
 *   a shared CPF between two records needs a human look.
 * - `matchGrade` follows the FHIR `match-grade` vocabulary: `match` is `certain`; `possible` at
 *   or above the midpoint between the thresholds is `probable`, below it `possible`; `no-match`
 *   with a veto is `certainly-not`, without one `null` (`$match` would not return it).
 *
 * Symmetric: swapping `local` and `incoming` gives the same decision, points and vetoes. Inputs
 * are never mutated, and explanations hold no patient values unless `includeValues` is set.
 *
 * @throws RangeError for invalid options (non-finite weights or thresholds, `fuzzyMin` outside
 * 0..1, `thresholds.possible` above `thresholds.match`).
 */
export function matchPatients(
  local: PatientLike,
  incoming: PatientLike,
  options?: MatchOptions,
): MatchResult {
  const { fields, suffixConflict, birthYearsDiffer, ctx } = compareFields(local, incoming, options);
  const outcome = (field: MatchField) => fields.find((r) => r.field === field)?.outcome;
  const agrees = (field: MatchField) => AGREES.has(outcome(field) ?? 'missing');

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

  const points = sum(fields);
  const insufficientEvidence = !(
    agrees('given') &&
    agrees('family') &&
    agrees('birthDate') &&
    CORROBORATING.some(agrees)
  );
  const { thresholds } = ctx;
  let decision: MatchDecision = 'no-match';
  if (vetoes.length === 0) {
    if (points >= thresholds.match && !insufficientEvidence) decision = 'match';
    else if (points >= thresholds.possible) decision = 'possible';
  }
  if (decision === 'no-match' && outcome('identifier') === 'exact') decision = 'possible';

  const maxPoints = Object.values(ctx.weights).reduce(
    (total, w) => total + Math.max(0, w.exact),
    0,
  );
  return {
    decision,
    matchGrade: grade(decision, points, thresholds, vetoes.length > 0),
    score: maxPoints > 0 ? clamp(points / maxPoints) : 0,
    points,
    thresholds: { ...thresholds },
    fields,
    vetoes,
    insufficientEvidence,
  };
}

function grade(
  decision: MatchDecision,
  points: number,
  thresholds: MatchThresholds,
  vetoed: boolean,
): FhirMatchGrade | null {
  if (decision === 'match') return 'certain';
  if (decision === 'possible') {
    return points >= (thresholds.match + thresholds.possible) / 2 ? 'probable' : 'possible';
  }
  return vetoed ? 'certainly-not' : null;
}

function sum(fields: readonly FieldResult[]): number {
  return fields.reduce((total, r) => total + r.points, 0);
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
