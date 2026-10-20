import { PLACEHOLDER_BIRTH_DATES } from './placeholders.js';

export type BirthDatePrecision = 'year' | 'month' | 'day';

export interface NormalizedBirthDate {
  /** The date as given, in FHIR form: `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. */
  value: string;
  precision: BirthDatePrecision;
  year: number;
  /** 1–12, when the precision is `month` or `day`. */
  month: number | undefined;
  /** 1–31, when the precision is `day`. */
  day: number | undefined;
}

/** FHIR `date`: a year, optionally with month, optionally with day. No time or zone. */
const FHIR_DATE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

/** Years before this are sentinel values (0001, 1800, 1899), not living patients. */
const MIN_YEAR = 1900;

/**
 * Parses a FHIR birth date, keeping partial dates at their own precision.
 *
 * Returns `undefined` for anything that is not a FHIR `date` (including date-times and
 * `dd/mm/yyyy`, which is ambiguous between Brazil and the US), for days that do not exist
 * (`1987-02-30`), and for placeholders: years before 1900 and `1900-01-01`.
 *
 * The check against "today" (future dates) is left to the caller, so this stays pure.
 *
 * @example normalizeBirthDate('1987-03') // { value: '1987-03', precision: 'month', year: 1987, month: 3, day: undefined }
 */
export function normalizeBirthDate(value: string): NormalizedBirthDate | undefined {
  const date = value.normalize('NFKC').trim();
  const parts = FHIR_DATE.exec(date);
  if (parts === null) return undefined;
  const [, y = '', m, d] = parts;

  const year = Number(y);
  if (year < MIN_YEAR || PLACEHOLDER_BIRTH_DATES.has(date)) return undefined;
  if (m === undefined) {
    return { value: date, precision: 'year', year, month: undefined, day: undefined };
  }

  const month = Number(m);
  if (month < 1 || month > 12) return undefined;
  if (d === undefined) return { value: date, precision: 'month', year, month, day: undefined };

  const day = Number(d);
  if (day < 1 || day > daysInMonth(year, month)) return undefined;
  return { value: date, precision: 'day', year, month, day };
}

/** Gregorian calendar: leap years are divisible by 4, except centuries not divisible by 400. */
function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}
