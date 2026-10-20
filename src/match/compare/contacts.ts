import { fieldResult, type MatchContext } from '../context.js';
import type { FieldResult } from '../types.js';

/**
 * Phones and emails: any normalized value on both sides is `exact`; usable values on both sides
 * with none in common is a `conflict`. There is no fuzzy step: a number one digit off is
 * another number.
 */
export function compareContacts(
  field: 'phone' | 'email',
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
  ctx: MatchContext,
): FieldResult {
  const noun = field === 'phone' ? 'phone number' : 'email address';
  const article = field === 'phone' ? 'a' : 'an';
  const values = () => ({ local: listed(a), incoming: listed(b) });
  if (a.size === 0 || b.size === 0) {
    return fieldResult(ctx, field, 'missing', `no usable ${noun} on one or both sides`, values);
  }
  const shared = first(a, (value) => b.has(value));
  if (shared !== undefined) {
    return fieldResult(ctx, field, 'exact', `${article} ${noun} is shared`, () => ({
      local: shared,
      incoming: shared,
    }));
  }
  return fieldResult(
    ctx,
    field,
    'conflict',
    `both sides have ${article} ${noun} and none is shared`,
    values,
  );
}

/**
 * Trusted identifiers, compared system by system. One system whose values are disjoint is a
 * `conflict` even when another system agrees: two valid, different identifiers from a trusted
 * system belong to two people, and the merge must fail closed.
 */
export function compareIdentifiers(
  a: ReadonlyMap<string, ReadonlySet<string>>,
  b: ReadonlyMap<string, ReadonlySet<string>>,
  ctx: MatchContext,
): FieldResult {
  const agreeing: string[] = [];
  const disagreeing: string[] = [];
  for (const [system, values] of a) {
    const other = b.get(system);
    if (other === undefined) continue;
    (first(values, (v) => other.has(v)) !== undefined ? agreeing : disagreeing).push(system);
  }
  const describe = (systems: readonly string[]) => () => ({
    local: listed(
      systems.flatMap((system) => [...(a.get(system) ?? [])].map((v) => `${system}|${v}`)),
    ),
    incoming: listed(
      systems.flatMap((system) => [...(b.get(system) ?? [])].map((v) => `${system}|${v}`)),
    ),
  });

  if (disagreeing.length > 0) {
    return fieldResult(
      ctx,
      'identifier',
      'conflict',
      `trusted identifiers differ (system: ${disagreeing.join(', ')})`,
      describe(disagreeing),
    );
  }
  if (agreeing.length > 0) {
    return fieldResult(
      ctx,
      'identifier',
      'exact',
      `a trusted identifier is equal (system: ${agreeing.join(', ')})`,
      describe(agreeing),
    );
  }
  return fieldResult(ctx, 'identifier', 'missing', 'no trusted identifier system on both sides');
}

export function compareGender(
  a: string | undefined,
  b: string | undefined,
  ctx: MatchContext,
): FieldResult {
  const values = () => ({ local: a, incoming: b });
  if (a === undefined || b === undefined) {
    return fieldResult(ctx, 'gender', 'missing', 'no known gender on one or both sides', values);
  }
  return a === b
    ? fieldResult(ctx, 'gender', 'exact', 'genders are equal', values)
    : fieldResult(ctx, 'gender', 'conflict', 'genders differ', values);
}

function listed(values: Iterable<string>): string | undefined {
  const list = [...values];
  return list.length === 0 ? undefined : list.join(', ');
}

function first<T>(values: Iterable<T>, test: (value: T) => boolean): T | undefined {
  for (const value of values) if (test(value)) return value;
  return undefined;
}
