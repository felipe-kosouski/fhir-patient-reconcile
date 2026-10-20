import { describe, expect, it } from 'vitest';
import { type NormalizedBirthDate, normalizeBirthDate } from '../../../src/index.js';

const day = (value: string, year: number, month: number, d: number): NormalizedBirthDate => ({
  value,
  precision: 'day',
  year,
  month,
  day: d,
});

// [input, expected, why]
const cases: ReadonlyArray<readonly [string, NormalizedBirthDate | undefined, string]> = [
  ['1987-03-14', day('1987-03-14', 1987, 3, 14), 'full FHIR date'],
  [' 1987-03-14 ', day('1987-03-14', 1987, 3, 14), 'surrounding whitespace is trimmed'],
  [
    '1987-03',
    { value: '1987-03', precision: 'month', year: 1987, month: 3, day: undefined },
    'FHIR allows year-month: kept at month precision, not padded to a day',
  ],
  [
    '1987',
    { value: '1987', precision: 'year', year: 1987, month: undefined, day: undefined },
    'FHIR allows a year alone',
  ],
  ['２０００-０２-２９', day('2000-02-29', 2000, 2, 29), 'full-width digits fold under NFKC'],
  ['2000-02-29', day('2000-02-29', 2000, 2, 29), '2000 is a leap year (divisible by 400)'],
  ['2024-02-29', day('2024-02-29', 2024, 2, 29), '2024 is a leap year (divisible by 4)'],
  ['2023-02-29', undefined, '2023 is not a leap year'],
  ['1900-02-29', undefined, '1900 is not a leap year (century not divisible by 400)'],
  ['1987-02-30', undefined, 'February never has 30 days'],
  ['1987-04-31', undefined, 'April has 30 days'],
  ['1987-12-31', day('1987-12-31', 1987, 12, 31), 'last day of the year'],
  ['1987-13-01', undefined, 'month out of range'],
  ['1987-00-10', undefined, 'month zero'],
  ['1987-03-00', undefined, 'day zero'],
  ['1987-3-14', undefined, 'FHIR requires two-digit months and days'],
  ['14/03/1987', undefined, 'dd/mm/yyyy is ambiguous with US mm/dd/yyyy, so it is not guessed'],
  ['19870314', undefined, 'basic ISO format is not a FHIR date'],
  ['1987-03-14T00:00:00Z', undefined, 'a date-time is not a FHIR date (birthDate is a date)'],
  ['1900-01-01', undefined, 'the most common "unknown" sentinel date'],
  ['1899-12-31', undefined, 'years before 1900 are sentinel values'],
  ['0001-01-01', undefined, 'minimum-date sentinel'],
  ['1900-01-02', day('1900-01-02', 1900, 1, 2), 'only 1900-01-01 is a sentinel, not the year 1900'],
  ['', undefined, 'empty'],
];

describe('normalizeBirthDate', () => {
  it.each(cases)('%j -> %j (%s)', (input, expected) => {
    expect(normalizeBirthDate(input)).toEqual(expected);
  });
});
