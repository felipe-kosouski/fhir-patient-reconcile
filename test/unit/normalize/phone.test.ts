import { describe, expect, it } from 'vitest';
import { type NormalizedPhone, normalizePhone, type PhoneCountry } from '../../../src/index.js';

// Oracles:
// - Brazil (Anatel numbering plan): country code 55; 67 two-digit area codes (DDD), none ending
//   in 0; mobiles have 9 digits starting with 9 (the "ninth digit", nationwide since 2016);
//   landlines have 8 digits starting with 2-5; national trunk prefix 0, optionally followed by a
//   2-digit carrier code; 0800/0300 numbers are non-geographic services.
// - NANP: country code 1; NPA (area code) and NXX (exchange) both start with 2-9; N11 codes are
//   service codes; N9X area codes are reserved; 555-0100 to 555-0199 are set aside for fiction.
//
// Brazil has no official fictional range, so Brazilian numbers here are patterned on purpose.

interface Case {
  input: string;
  defaultCountry?: PhoneCountry;
  expected: NormalizedPhone | undefined;
  why: string;
}

const mobileBR: NormalizedPhone = {
  e164: '+5541998765432',
  line: 'mobile',
  ninthDigitAdded: false,
};
const usFiction: NormalizedPhone = {
  e164: '+14155550123',
  line: 'unknown',
  ninthDigitAdded: false,
};

const cases: Case[] = [
  // --- Brazil: formats of the same mobile ---
  {
    input: '(41) 99876-5432',
    defaultCountry: 'BR',
    expected: mobileBR,
    why: 'DDD + 9-digit mobile',
  },
  { input: '+55 41 99876 5432', defaultCountry: 'BR', expected: mobileBR, why: 'with +55' },
  {
    input: '55 41 99876-5432',
    defaultCountry: 'BR',
    expected: mobileBR,
    why: '55 without plus: 13 digits can only be country code + national',
  },
  {
    input: '0055 41 99876-5432',
    defaultCountry: 'BR',
    expected: mobileBR,
    why: '00 is the international prefix dialed from Brazil',
  },
  {
    input: '041 99876-5432',
    defaultCountry: 'BR',
    expected: mobileBR,
    why: 'national trunk prefix 0 before the DDD',
  },
  {
    input: '0 41 41 99876-5432',
    defaultCountry: 'BR',
    expected: mobileBR,
    why: 'trunk prefix 0 + carrier code 41 + DDD',
  },
  { input: '41998765432', defaultCountry: 'BR', expected: mobileBR, why: 'digits only' },
  {
    input: '(41) 9876-5432',
    defaultCountry: 'BR',
    expected: { e164: '+5541998765432', line: 'mobile', ninthDigitAdded: true },
    why: 'old 8-digit mobile (starts 6-9) gains the ninth digit, so it equals the current number',
  },
  // --- Brazil: landlines and special area codes ---
  {
    input: '(41) 3333-1234',
    defaultCountry: 'BR',
    expected: { e164: '+554133331234', line: 'landline', ninthDigitAdded: false },
    why: 'landlines have 8 digits starting with 2-5',
  },
  {
    input: '41 3333-1234 ramal 22',
    defaultCountry: 'BR',
    expected: { e164: '+554133331234', line: 'landline', ninthDigitAdded: false },
    why: 'extensions (ramal) are ignored',
  },
  {
    input: '(55) 99876-5432',
    defaultCountry: 'BR',
    expected: { e164: '+5555998765432', line: 'mobile', ninthDigitAdded: false },
    why: 'DDD 55 (Rio Grande do Sul) is not mistaken for the country code: 11 digits is national',
  },
  // --- Brazil: rejected ---
  {
    input: '(20) 3333-1234',
    defaultCountry: 'BR',
    expected: undefined,
    why: 'DDD 20 does not exist',
  },
  {
    input: '(41) 1333-1234',
    defaultCountry: 'BR',
    expected: undefined,
    why: '8-digit numbers starting with 0 or 1 are not assigned',
  },
  {
    input: '(41) 89876-5432',
    defaultCountry: 'BR',
    expected: undefined,
    why: '9-digit numbers must start with 9',
  },
  {
    input: '99876-5432',
    defaultCountry: 'BR',
    expected: undefined,
    why: 'no area code: the number cannot be placed',
  },
  {
    input: '0800 123 4567',
    defaultCountry: 'BR',
    expected: undefined,
    why: 'toll-free service numbers are not personal phones',
  },
  {
    input: '(41) 99999-9999',
    defaultCountry: 'BR',
    expected: undefined,
    why: 'placeholder: one repeated digit',
  },
  {
    input: '(11) 3333-3333',
    defaultCountry: 'BR',
    expected: undefined,
    why: 'placeholder: one repeated digit after the DDD',
  },
  // --- NANP ---
  { input: '(415) 555-0123', defaultCountry: 'US', expected: usFiction, why: 'NPA + NXX + line' },
  { input: '+1 415 555 0123', defaultCountry: 'US', expected: usFiction, why: 'with +1' },
  {
    input: '1-415-555-0123',
    defaultCountry: 'US',
    expected: usFiction,
    why: 'national trunk prefix 1',
  },
  {
    input: '415.555.0123 x204',
    defaultCountry: 'US',
    expected: usFiction,
    why: 'extensions are ignored',
  },
  { input: 'tel:+1-415-555-0123', expected: usFiction, why: 'tel: URI scheme (RFC 3966) removed' },
  {
    input: 'tel:+1-415-555-0123;ext=204',
    expected: usFiction,
    why: 'RFC 3966 extension parameter ignored',
  },
  {
    input: '(800) 555-0123',
    defaultCountry: 'US',
    expected: undefined,
    why: 'toll-free (8XX) numbers are not personal phones, as with Brazilian 0800',
  },
  {
    input: '(900) 555-0123',
    defaultCountry: 'US',
    expected: undefined,
    why: '900 numbers are premium-rate services',
  },
  {
    input: '(115) 555-0123',
    defaultCountry: 'US',
    expected: undefined,
    why: 'area codes cannot start with 0 or 1',
  },
  {
    input: '(911) 555-0123',
    defaultCountry: 'US',
    expected: undefined,
    why: 'N11 codes are service codes, not area codes',
  },
  {
    input: '(495) 555-0123',
    defaultCountry: 'US',
    expected: undefined,
    why: 'N9X area codes are reserved',
  },
  {
    input: '(415) 155-0123',
    defaultCountry: 'US',
    expected: undefined,
    why: 'exchanges cannot start with 0 or 1',
  },
  {
    input: '(415) 555-5555',
    defaultCountry: 'US',
    expected: undefined,
    why: 'placeholder: one repeated digit in the line',
  },
  {
    input: '1-800-FLOWERS',
    defaultCountry: 'US',
    expected: undefined,
    why: 'letters (vanity numbers) are not supported',
  },
  // --- choosing the country ---
  {
    input: '(+55) 41 99876-5432',
    defaultCountry: 'US',
    expected: mobileBR,
    why: 'a "+" after an opening parenthesis is still an explicit country code',
  },
  {
    input: '+55 41 99876-5432',
    defaultCountry: 'US',
    expected: mobileBR,
    why: 'an explicit country code beats the default',
  },
  {
    input: '+44 20 7946 0000',
    defaultCountry: 'BR',
    expected: undefined,
    why: 'other countries are out of scope; use the phone normalizer hook',
  },
  {
    input: '(41) 99876-5432',
    expected: mobileBR,
    why: 'no default: 11 digits without a leading 1 only parse as Brazilian',
  },
  {
    input: '1 415 555 0123',
    expected: usFiction,
    why: 'no default: only parses as NANP (Brazil has no 9-digit number starting 1)',
  },
  {
    input: '(415) 555-0123',
    expected: undefined,
    why: 'no default: also a valid Brazilian landline (41) 5555-0123, so ambiguous',
  },
  // --- empty ---
  { input: '', defaultCountry: 'BR', expected: undefined, why: 'empty' },
  { input: 'n/a', defaultCountry: 'BR', expected: undefined, why: 'no digits' },
];

describe('normalizePhone', () => {
  it.each(cases)('$input ($defaultCountry): $why', ({ input, defaultCountry, expected }) => {
    expect(normalizePhone(input, { defaultCountry })).toEqual(expected);
  });
});
