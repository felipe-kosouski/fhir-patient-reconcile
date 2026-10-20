import type { NormalizedBirthDate } from '../../normalize/date.js';
import { fieldResult, type MatchContext } from '../context.js';
import type { FieldResult } from '../types.js';

const DAY_MS = 86_400_000;

/**
 * - Full dates: equal is `exact`; `fuzzy` for the usual entry errors (day and month swapped,
 *   one day apart, one mistyped year digit); anything else is a `conflict`.
 * - A partial date (`1987`, `1987-03`) is compared at the precision both sides have. It can
 *   disprove a match but never confirm one, so agreement is `missing`, not `exact`.
 */
export function compareBirthDate(
  a: NormalizedBirthDate | undefined,
  b: NormalizedBirthDate | undefined,
  ctx: MatchContext,
): FieldResult {
  const values = () => ({ local: a?.value, incoming: b?.value });
  if (a === undefined || b === undefined) {
    return fieldResult(
      ctx,
      'birthDate',
      'missing',
      'no usable birth date on one or both sides',
      values,
    );
  }

  const fullA = fullDate(a);
  const fullB = fullDate(b);
  if (fullA === undefined || fullB === undefined) {
    const agree =
      a.year === b.year && (a.month === undefined || b.month === undefined || a.month === b.month);
    return agree
      ? fieldResult(
          ctx,
          'birthDate',
          'missing',
          'a partial birth date agrees but cannot confirm the full date',
          values,
        )
      : fieldResult(
          ctx,
          'birthDate',
          'conflict',
          'birth dates differ at the precision both sides have',
          values,
        );
  }

  if (a.value === b.value) {
    return fieldResult(ctx, 'birthDate', 'exact', 'birth dates are equal', values);
  }
  if (fullA.year === fullB.year && fullA.month === fullB.day && fullA.day === fullB.month) {
    return fieldResult(ctx, 'birthDate', 'fuzzy', 'day and month are swapped', values);
  }
  if (Math.abs(utc(fullA) - utc(fullB)) === DAY_MS) {
    return fieldResult(ctx, 'birthDate', 'fuzzy', 'birth dates are one day apart', values);
  }
  if (
    fullA.month === fullB.month &&
    fullA.day === fullB.day &&
    differingDigits(String(fullA.year), String(fullB.year)) === 1
  ) {
    return fieldResult(ctx, 'birthDate', 'fuzzy', 'one digit of the year differs', values);
  }
  return fieldResult(ctx, 'birthDate', 'conflict', 'birth dates differ', values);
}

interface FullDate {
  year: number;
  month: number;
  day: number;
}

function fullDate(date: NormalizedBirthDate): FullDate | undefined {
  const { year, month, day } = date;
  return month === undefined || day === undefined ? undefined : { year, month, day };
}

function utc(date: FullDate): number {
  return Date.UTC(date.year, date.month - 1, date.day);
}

/** Positions where two equal-length digit strings differ; Infinity when the lengths differ. */
function differingDigits(a: string, b: string): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let count = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) count++;
  return count;
}
