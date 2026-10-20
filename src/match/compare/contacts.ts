import { fieldResult, type MatchContext } from '../context.js';
import type { FieldResult } from '../types.js';

/**
 * Phones and emails: any normalized value on both sides is `exact`; usable values on both sides
 * with none in common is a `conflict`. There is no fuzzy step: a number one digit off is
 * another number.
 */
export function compareContacts(
  field: 'phone' | 'email',
  a: readonly string[],
  b: readonly string[],
  ctx: MatchContext,
): FieldResult {
  const noun = field === 'phone' ? 'phone number' : 'email address';
  if (a.length === 0 || b.length === 0) {
    return fieldResult(ctx, field, 'missing', `no usable ${noun} on one or both sides`, {
      local: listed(a),
      incoming: listed(b),
    });
  }
  const shared = a.find((value) => b.includes(value));
  if (shared !== undefined) {
    return fieldResult(ctx, field, 'exact', `a ${noun} is shared`, {
      local: shared,
      incoming: shared,
    });
  }
  return fieldResult(ctx, field, 'conflict', `both sides have a ${noun} and none is shared`, {
    local: listed(a),
    incoming: listed(b),
  });
}

/**
 * Trusted identifiers, compared system by system. One system whose values are disjoint is a
 * `conflict` even when another system agrees: two valid, different identifiers from a trusted
 * system belong to two people, and the merge must fail closed.
 */
export function compareIdentifiers(
  a: ReadonlyMap<string, readonly string[]>,
  b: ReadonlyMap<string, readonly string[]>,
  ctx: MatchContext,
): FieldResult {
  const agreeing: string[] = [];
  const disagreeing: string[] = [];
  for (const [system, values] of a) {
    const other = b.get(system);
    if (other === undefined) continue;
    (values.some((v) => other.includes(v)) ? agreeing : disagreeing).push(system);
  }
  const describe = (map: ReadonlyMap<string, readonly string[]>, systems: readonly string[]) =>
    listed(systems.flatMap((system) => (map.get(system) ?? []).map((v) => `${system}|${v}`)));

  if (disagreeing.length > 0) {
    return fieldResult(
      ctx,
      'identifier',
      'conflict',
      `trusted identifiers differ (system: ${disagreeing.join(', ')})`,
      { local: describe(a, disagreeing), incoming: describe(b, disagreeing) },
    );
  }
  if (agreeing.length > 0) {
    return fieldResult(
      ctx,
      'identifier',
      'exact',
      `a trusted identifier is equal (system: ${agreeing.join(', ')})`,
      { local: describe(a, agreeing), incoming: describe(b, agreeing) },
    );
  }
  return fieldResult(ctx, 'identifier', 'missing', 'no trusted identifier system on both sides');
}

export function compareGender(
  a: string | undefined,
  b: string | undefined,
  ctx: MatchContext,
): FieldResult {
  const values = { local: a, incoming: b };
  if (a === undefined || b === undefined) {
    return fieldResult(ctx, 'gender', 'missing', 'no known gender on one or both sides', values);
  }
  return a === b
    ? fieldResult(ctx, 'gender', 'exact', 'genders are equal', values)
    : fieldResult(ctx, 'gender', 'conflict', 'genders differ', values);
}

function listed(values: readonly string[]): string | undefined {
  return values.length === 0 ? undefined : values.join(', ');
}
