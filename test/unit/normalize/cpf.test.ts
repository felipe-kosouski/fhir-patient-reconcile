import { describe, expect, it } from 'vitest';
import { normalizeCpf } from '../../../src/index.js';

// Valid CPFs below are the worked examples used in published explanations of the check-digit
// algorithm (111.444.777-35, 529.982.247-25), not values computed by this code.
// [input, expected, why]
const cases: ReadonlyArray<readonly [string, string | undefined, string]> = [
  ['111.444.777-35', '11144477735', 'formatted, published worked example'],
  ['11144477735', '11144477735', 'digits only'],
  [' 529.982.247-25 ', '52998224725', 'second published example, trimmed'],
  ['529 982 247 25', '52998224725', 'spaces as separators'],
  ['１１１.４４４.７７７-３５', '11144477735', 'full-width digits fold under NFKC'],
  ['111.444.777-36', undefined, 'wrong second check digit'],
  ['111.444.777-45', undefined, 'wrong first check digit'],
  ['111.444.777-53', undefined, 'check digits swapped'],
  ['1144477735', undefined, '10 digits: a lost leading zero is not restored by guessing'],
  ['111444777350', undefined, '12 digits'],
  ['000.000.000-00', undefined, 'all zeros passes the checksum but is a placeholder'],
  ['111.111.111-11', undefined, 'one repeated digit passes the checksum but is a placeholder'],
  ['999.999.999-99', undefined, 'repeated nines, same rule'],
  ['123.456.789-09', undefined, 'ascending sequence with valid check digits, typed as a fake'],
  ['012.345.678-90', undefined, 'ascending sequence from zero, same rule'],
  ['111.444.777/35', undefined, 'slash is a CNPJ separator, not a CPF one'],
  ['CPF 111.444.777-35', undefined, 'labels make the value invalid, as with phones'],
  ['', undefined, 'empty'],
];

describe('normalizeCpf', () => {
  it.each(cases)('%j -> %j (%s)', (input, expected) => {
    expect(normalizeCpf(input)).toBe(expected);
  });
});
