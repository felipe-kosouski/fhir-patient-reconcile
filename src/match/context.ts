import { RNDS_CPF_SYSTEM } from '../normalize/cpf.js';
import { normalizePhone } from '../normalize/phone.js';
import { DEFAULT_NAME_FUZZY_MIN, DEFAULT_WEIGHTS } from './defaults.js';
import type {
  FieldOutcome,
  FieldResult,
  FieldWeightOverrides,
  FieldWeights,
  MatchField,
  MatchOptions,
} from './types.js';

/** Options resolved once per comparison. */
export interface MatchContext {
  weights: Readonly<Record<MatchField, Readonly<FieldWeights>>>;
  fuzzyMin: number;
  includeValues: boolean;
  trustedSystems: ReadonlySet<string>;
  phone: (value: string) => string | undefined;
}

export function resolveContext(options: MatchOptions = {}): MatchContext {
  const overrides = options.weights ?? {};
  const weights = Object.fromEntries(
    (Object.keys(DEFAULT_WEIGHTS) as MatchField[]).map((field) => [
      field,
      { ...DEFAULT_WEIGHTS[field], ...withoutUndefined(overrides[field] ?? {}) },
    ]),
  ) as Record<MatchField, FieldWeights>;

  const { defaultCountry, normalizePhone: custom } = options;
  return {
    weights,
    fuzzyMin: options.nameSimilarity?.fuzzyMin ?? DEFAULT_NAME_FUZZY_MIN,
    includeValues: options.includeValues ?? false,
    trustedSystems: new Set(options.identifierSystems?.trusted ?? [RNDS_CPF_SYSTEM]),
    phone: custom ?? ((value) => normalizePhone(value, { defaultCountry })?.e164),
  };
}

/** `{ exact: undefined }` must not erase a default weight. */
function withoutUndefined(weights: FieldWeightOverrides): Partial<FieldWeights> {
  return Object.fromEntries(Object.entries(weights).filter(([, v]) => v !== undefined));
}

export interface ResultDetails {
  local?: string | undefined;
  incoming?: string | undefined;
  similarity?: number | undefined;
}

/** Builds a FieldResult: points from the weights, values only with `includeValues`. */
export function fieldResult(
  ctx: MatchContext,
  field: MatchField,
  outcome: FieldOutcome,
  reason: string,
  details: ResultDetails = {},
): FieldResult {
  const result: FieldResult = {
    field,
    outcome,
    points: outcome === 'missing' ? 0 : ctx.weights[field][outcome],
    reason,
  };
  if (details.similarity !== undefined) result.similarity = details.similarity;
  if (ctx.includeValues) {
    if (details.local !== undefined) result.local = details.local;
    if (details.incoming !== undefined) result.incoming = details.incoming;
  }
  return result;
}
