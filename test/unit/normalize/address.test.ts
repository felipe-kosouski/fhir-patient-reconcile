import { describe, expect, it } from 'vitest';
import { type AddressLike, type NormalizedAddress, normalizeAddress } from '../../../src/index.js';

const empty: NormalizedAddress = {
  line: undefined,
  city: undefined,
  state: undefined,
  postalCode: undefined,
  country: undefined,
};

interface Case {
  address: AddressLike;
  expected: Partial<NormalizedAddress> | undefined;
  why: string;
}

const cases: Case[] = [
  // --- Brazil ---
  {
    address: {
      line: ['R. das Flores, nº 100', 'Apto 12'],
      city: 'Curitiba',
      state: 'PR',
      postalCode: '80010-000',
      country: 'BR',
    },
    expected: {
      line: 'rua das flores 100 apartamento 12',
      city: 'curitiba',
      state: 'pr',
      postalCode: '80010000',
      country: 'BR',
    },
    why: 'Correios abbreviations expanded, "nº" marker dropped, CEP as 8 digits',
  },
  {
    address: { line: ['Rua das Flores 100'], postalCode: '80010000' },
    expected: { line: 'rua das flores 100', postalCode: '80010000', country: 'BR' },
    why: 'without a country, an 8-digit postal code is a CEP',
  },
  {
    address: { line: ['Av. Dr. Pedro Souza, 50'], country: 'Brasil' },
    expected: { line: 'avenida doutor pedro souza 50', country: 'BR' },
    why: '"Dr." in a Brazilian street name is Doutor; country name in Portuguese',
  },
  {
    address: { postalCode: '80.010-000', country: 'BR' },
    expected: { postalCode: '80010000', country: 'BR' },
    why: 'dotted CEP form "80.010-000" is still a CEP',
  },
  {
    address: { line: ['Rua A'], postalCode: '00000-000', country: 'BR' },
    expected: { line: 'rua a', country: 'BR' },
    why: 'all-zero CEP is a placeholder; the rest of the address is still usable',
  },
  {
    address: { line: ['Rua A'], postalCode: '00999-000', country: 'BR' },
    expected: { line: 'rua a', country: 'BR' },
    why: 'CEPs start at 01000-000',
  },
  {
    address: { line: ['Rua A'], postalCode: '80010', country: 'BR' },
    expected: { line: 'rua a', country: 'BR' },
    why: 'a 5-digit code cannot be a full CEP',
  },
  {
    address: { line: ['Rua do Norte no centro'], country: 'BR' },
    expected: { line: 'rua do norte no centro', country: 'BR' },
    why: '"no" is only a number marker before a number ("no centro" means "downtown")',
  },
  {
    address: { line: ['Rua A, no nº 5'], country: 'BR' },
    expected: { line: 'rua a 5', country: 'BR' },
    why: 'a run of number markers before a number is dropped whole, so the result is stable',
  },
  // --- United States ---
  {
    address: {
      line: ['123 N Main St.', 'Apt 4B'],
      city: 'Springfield',
      state: 'IL',
      postalCode: '62701-1234',
      country: 'USA',
    },
    expected: {
      line: '123 north main street apartment 4b',
      city: 'springfield',
      state: 'il',
      postalCode: '62701',
      country: 'US',
    },
    why: 'USPS Publication 28 abbreviations expanded; ZIP+4 compared at 5 digits',
  },
  {
    address: { line: ['500 Oak Dr'], postalCode: '62701' },
    expected: { line: '500 oak drive', postalCode: '62701', country: 'US' },
    why: 'without a country, a 5-digit postal code is a ZIP; "Dr" is Drive in US addresses',
  },
  {
    address: { line: ['123 N 5th St'], country: 'US' },
    expected: { line: '123 north 5th street', country: 'US' },
    why: 'US "N" before a number is North, not a number marker',
  },
  {
    address: { postalCode: '627011234' },
    expected: { postalCode: '62701', country: 'US' },
    why: '9 digits is ZIP+4 without the hyphen',
  },
  {
    address: { line: ['1 Elm St'], postalCode: '00012', country: 'US' },
    expected: { line: '1 elm street', country: 'US' },
    why: 'the 000 ZIP prefix is unassigned (lowest ZIP is 00501)',
  },
  {
    address: { line: ['1 Elm St'], postalCode: '80010-000', country: 'US' },
    expected: { line: '1 elm street', country: 'US' },
    why: 'an explicit country wins: a CEP-shaped code is not a valid ZIP',
  },
  // --- other countries and unknowns ---
  {
    address: { line: ['10 Downing St'], postalCode: 'SW1A 2AA', country: 'GB' },
    expected: { line: '10 downing st', postalCode: 'sw1a2aa', country: undefined },
    why: 'other countries: postal code folded without spaces, no abbreviation rules',
  },
  {
    address: { line: ['Av. Central 10'] },
    expected: { line: 'av central 10' },
    why: 'unknown country: abbreviations are not expanded, since "Av" and "Dr" depend on it',
  },
  {
    address: { line: ['constructor'], country: 'constructor' },
    expected: { line: 'constructor' },
    why: 'object prototype names are plain words, not lookup hits',
  },
  // --- placeholders and nothing usable ---
  {
    address: { line: ['Não informado'], city: 'Desconhecido', state: 'PR' },
    expected: undefined,
    why: 'placeholder line and city; a state alone is not a usable address',
  },
  {
    address: { line: ['N/A'], postalCode: '62701' },
    expected: { postalCode: '62701', country: 'US' },
    why: '"N/A" is missing, the ZIP is still usable',
  },
  {
    address: { text: 'Rua das Flores, 100, Curitiba - PR, 80010-000' },
    expected: undefined,
    why: 'Address.text is not parsed in v0.1',
  },
  {
    address: { line: ['123 Main St', 'N/A'], country: 'US' },
    expected: { line: '123 main street', country: 'US' },
    why: 'a placeholder in one line entry is dropped on its own (not expanded to "north a")',
  },
  {
    address: { line: ['Rua A 10', 'Não informado'], country: 'BR' },
    expected: { line: 'rua a 10', country: 'BR' },
    why: 'same rule for Brazilian placeholder entries',
  },
  { address: {}, expected: undefined, why: 'empty address' },
];

describe('normalizeAddress', () => {
  it.each(cases)('$why', ({ address, expected }) => {
    expect(normalizeAddress(address)).toEqual(
      expected === undefined ? undefined : { ...empty, ...expected },
    );
  });
});

describe('normalizeAddress on hostile input', () => {
  // A run of number markers used to be rescanned from every marker: 100k tokens took ~30 s.
  it('drops number markers in linear time', { timeout: 2000 }, () => {
    const line = `${'no '.repeat(100_000)}5`;
    expect(normalizeAddress({ line: [line], country: 'BR' })?.line).toBe('5');
  });
});

describe('normalizeAddress on FHIR JSON', () => {
  it('skips null line entries and reads a null postal code as missing', () => {
    const address = JSON.parse('{"line": [null, "Rua A 10"], "postalCode": null, "country": "BR"}');
    expect(normalizeAddress(address)).toEqual({ ...empty, line: 'rua a 10', country: 'BR' });
  });
});
