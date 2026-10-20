import { RNDS_CPF_SYSTEM } from '../normalize/cpf.js';
import { normalizePhone } from '../normalize/phone.js';
import { DEFAULT_NAME_FUZZY_MIN, DEFAULT_THRESHOLDS, DEFAULT_WEIGHTS } from './defaults.js';
import type {
  FieldOutcome,
  FieldResult,
  FieldWeightOverrides,
  FieldWeights,
  MatchField,
  MatchOptions,
  MatchThresholds,
} from './types.js';

/** Options resolved once per comparison. */
export interface MatchContext {
  weights: Readonly<Record<MatchField, Readonly<FieldWeights>>>;
  thresholds: Readonly<MatchThresholds>;
  fuzzyMin: number;
  includeValues: boolean;
  trustedSystems: ReadonlySet<string>;
  phone: (value: string) => string | undefined;
}

/**
 * Resolves and validates the options. A configuration mistake (NaN weight, cut-off outside
 * 0..1, `possible` above `match`) throws a RangeError instead of silently producing NaN points.
 */
export function resolveContext(options: MatchOptions = {}): MatchContext {
  const overrides = options.weights ?? {};
  const weights = Object.fromEntries(
    (Object.keys(DEFAULT_WEIGHTS) as MatchField[]).map((field) => [
      field,
      {
        ...DEFAULT_WEIGHTS[field],
        ...withoutUndefined<FieldWeightOverrides>(overrides[field] ?? {}),
      },
    ]),
  ) as Record<MatchField, FieldWeights>;

  for (const [field, w] of Object.entries(weights)) {
    for (const [outcome, value] of Object.entries(w)) {
      requireFinite(value, `weights.${field}.${outcome}`);
    }
  }
  const thresholds = {
    ...DEFAULT_THRESHOLDS,
    ...withoutUndefined(options.thresholds ?? {}),
  } as MatchThresholds;
  requireFinite(thresholds.match, 'thresholds.match');
  requireFinite(thresholds.possible, 'thresholds.possible');
  if (thresholds.possible > thresholds.match) {
    throw new RangeError(
      `thresholds.possible (${thresholds.possible}) must not exceed thresholds.match (${thresholds.match})`,
    );
  }
  const fuzzyMin = options.nameSimilarity?.fuzzyMin ?? DEFAULT_NAME_FUZZY_MIN;
  if (!(fuzzyMin >= 0 && fuzzyMin <= 1)) {
    throw new RangeError(`nameSimilarity.fuzzyMin must be between 0 and 1, got ${fuzzyMin}`);
  }

  const { defaultCountry, normalizePhone: custom } = options;
  return {
    weights,
    thresholds,
    fuzzyMin,
    includeValues: options.includeValues ?? false,
    trustedSystems: new Set(options.identifierSystems?.trusted ?? [RNDS_CPF_SYSTEM]),
    phone: custom ?? ((value) => normalizePhone(value, { defaultCountry })?.e164),
  };
}

/** `{ exact: undefined }` must not erase a default. */
function withoutUndefined<T extends object>(values: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(values).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

function requireFinite(value: unknown, name: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number, got ${String(value)}`);
  }
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
