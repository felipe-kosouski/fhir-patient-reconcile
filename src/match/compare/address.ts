import type { NormalizedAddress } from '../../normalize/address.js';
import { fieldResult, type MatchContext } from '../context.js';
import type { FieldResult } from '../types.js';

/**
 * Compares every local address with every incoming one and keeps the pair with the most points.
 * Pairs with nothing comparable are skipped, so they cannot hide a conflict.
 *
 * Per pair:
 * - different known countries: `conflict`;
 * - same postal code: `exact` with the same street line, otherwise `fuzzy`;
 * - different postal codes: `conflict` (the same street name exists in many cities);
 * - a postal code missing on either side: same line is `fuzzy`, a different line a `conflict`;
 * - city or state alone is not compared.
 */
export function compareAddresses(
  local: readonly NormalizedAddress[],
  incoming: readonly NormalizedAddress[],
  ctx: MatchContext,
): FieldResult {
  let best: FieldResult | undefined;
  for (const a of local) {
    for (const b of incoming) {
      const result = comparePair(a, b, ctx);
      if (result !== undefined && (best === undefined || result.points > best.points)) {
        best = result;
      }
    }
  }
  return best ?? fieldResult(ctx, 'address', 'missing', 'no comparable address on both sides');
}

function comparePair(
  a: NormalizedAddress,
  b: NormalizedAddress,
  ctx: MatchContext,
): FieldResult | undefined {
  const values = () => ({ local: describe(a), incoming: describe(b) });
  if (a.country !== undefined && b.country !== undefined && a.country !== b.country) {
    return fieldResult(ctx, 'address', 'conflict', 'addresses are in different countries', values);
  }
  const sameLine = a.line !== undefined && a.line === b.line;
  if (a.postalCode !== undefined && b.postalCode !== undefined) {
    if (a.postalCode !== b.postalCode) {
      return fieldResult(ctx, 'address', 'conflict', 'postal codes differ', values);
    }
    return sameLine
      ? fieldResult(ctx, 'address', 'exact', 'same postal code and street line', values)
      : fieldResult(
          ctx,
          'address',
          'fuzzy',
          'same postal code, different or missing street line',
          values,
        );
  }
  if (a.line === undefined || b.line === undefined) return undefined;
  return sameLine
    ? fieldResult(ctx, 'address', 'fuzzy', 'same street line, postal code missing', values)
    : fieldResult(ctx, 'address', 'conflict', 'street lines differ, postal code missing', values);
}

function describe(address: NormalizedAddress): string {
  const { line, city, state, postalCode, country } = address;
  return [line, city, state, postalCode, country].filter((part) => part !== undefined).join(', ');
}
