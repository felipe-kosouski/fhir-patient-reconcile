import { RNDS_CPF_SYSTEM } from '../normalize/cpf.js';
import { normalizePhone } from '../normalize/phone.js';
import { DEFAULT_NAME_FUZZY_MIN, DEFAULT_THRESHOLDS, DEFAULT_WEIGHTS } from './defaults.js';
import type {
  FieldOutcome,
  FieldResult,
  FieldWeights,
  MatchField,
  MatchOptions,
  MatchThresholds,
} from './types.js';

/** Every `MatchOptions` key, so a typo (`defaultCountyr`) fails instead of being ignored. */
const KNOWN_OPTIONS: Readonly<Record<keyof MatchOptions, true>> = {
  weights: true,
  thresholds: true,
  defaultCountry: true,
  normalizePhone: true,
  identifierSystems: true,
  nameSimilarity: true,
  includeValues: true,
};

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
 * Resolves and validates the options once per call. Configuration mistakes fail loudly instead
 * of silently changing results:
 * - RangeError: a non-finite weight or threshold, `fuzzyMin` outside 0..1, `possible` above
 *   `match`, an unknown option, field, outcome or threshold name (a typo such as `birthdate`), or a
 *   `defaultCountry` other than `BR` or `US`;
 * - TypeError: `identifierSystems.trusted` that is not an array of strings, or a
 *   `normalizePhone` that is not a function.
 *
 * `includeValues` must be exactly `true` to add patient values: a truthy string from an untyped
 * configuration (`'false'`) must not leak PHI.
 */
export function resolveContext(options: MatchOptions = {}): MatchContext {
  requireKnownKeys(options, KNOWN_OPTIONS, 'options');
  requireKnownKeys(options.nameSimilarity ?? {}, { fuzzyMin: true }, 'nameSimilarity');
  requireKnownKeys(options.identifierSystems ?? {}, { trusted: true }, 'identifierSystems');
  const overrides = options.weights ?? {};
  requireKnownKeys(overrides, DEFAULT_WEIGHTS, 'weights');
  const weights = {} as Record<MatchField, FieldWeights>;
  for (const field of Object.keys(DEFAULT_WEIGHTS) as MatchField[]) {
    const override = overrides[field] ?? {};
    requireKnownKeys(override, DEFAULT_WEIGHTS[field], `weights.${field}`);
    weights[field] = { ...DEFAULT_WEIGHTS[field], ...withoutUndefined(override) };
    for (const [outcome, value] of Object.entries(weights[field])) {
      requireFinite(value, `weights.${field}.${outcome}`);
    }
  }

  const thresholdOverrides = options.thresholds ?? {};
  requireKnownKeys(thresholdOverrides, DEFAULT_THRESHOLDS, 'thresholds');
  const thresholds = { ...DEFAULT_THRESHOLDS, ...withoutUndefined(thresholdOverrides) };
  requireFinite(thresholds.match, 'thresholds.match');
  requireFinite(thresholds.possible, 'thresholds.possible');
  if (thresholds.possible > thresholds.match) {
    throw new RangeError(
      `thresholds.possible (${thresholds.possible}) must not exceed thresholds.match (${thresholds.match})`,
    );
  }

  const fuzzyMin = options.nameSimilarity?.fuzzyMin ?? DEFAULT_NAME_FUZZY_MIN;
  requireFinite(fuzzyMin, 'nameSimilarity.fuzzyMin');
  if (fuzzyMin < 0 || fuzzyMin > 1) {
    throw new RangeError(`nameSimilarity.fuzzyMin must be between 0 and 1, got ${fuzzyMin}`);
  }

  const { defaultCountry, normalizePhone: custom } = options;
  if (defaultCountry !== undefined && defaultCountry !== 'BR' && defaultCountry !== 'US') {
    throw new RangeError(`defaultCountry must be 'BR' or 'US', got ${String(defaultCountry)}`);
  }
  if (custom !== undefined && typeof custom !== 'function') {
    throw new TypeError('normalizePhone must be a function');
  }
  const trusted = options.identifierSystems?.trusted ?? [RNDS_CPF_SYSTEM];
  if (!Array.isArray(trusted) || !trusted.every((system) => typeof system === 'string')) {
    throw new TypeError('identifierSystems.trusted must be an array of strings');
  }

  return {
    weights,
    thresholds,
    fuzzyMin,
    includeValues: options.includeValues === true,
    trustedSystems: new Set(trusted),
    phone: custom ?? ((value) => normalizePhone(value, { defaultCountry })?.e164),
  };
}

/** `{ exact: undefined }` must not erase a default. */
function withoutUndefined<T extends object>(
  values: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}

function requireKnownKeys(values: object, known: object, name: string): void {
  for (const key of Object.keys(values)) {
    if (!Object.hasOwn(known, key)) {
      const allowed = Object.keys(known).join(', ');
      const path = name === 'options' ? key : `${name}.${key}`;
      throw new RangeError(`unknown option ${path} (expected one of: ${allowed})`);
    }
  }
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
