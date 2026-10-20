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

export interface ResultValues {
  local?: string | undefined;
  incoming?: string | undefined;
}

/**
 * Builds a FieldResult: points from the weights, values only with `includeValues`. Values come
 * from a function so they are only built (joined, formatted) when they will be reported.
 */
export function fieldResult(
  ctx: MatchContext,
  field: MatchField,
  outcome: FieldOutcome,
  reason: string,
  values?: () => ResultValues,
  similarity?: number,
): FieldResult {
  const result: FieldResult = {
    field,
    outcome,
    points: outcome === 'missing' ? 0 : ctx.weights[field][outcome],
    reason,
  };
  if (similarity !== undefined) result.similarity = similarity;
  if (ctx.includeValues && values !== undefined) {
    const { local, incoming } = values();
    if (local !== undefined) result.local = local;
    if (incoming !== undefined) result.incoming = incoming;
  }
  return result;
}
