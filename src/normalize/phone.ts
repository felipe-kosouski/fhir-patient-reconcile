import { isRepeatedDigits } from './placeholders.js';

/** Countries with a built-in phone parser. Others go through a custom normalizer hook. */
export type PhoneCountry = 'BR' | 'US';

export interface NormalizedPhone {
  /** E.164 form, e.g. `+5541998765432`. Brazilian 8-digit mobiles gain their ninth digit. */
  e164: string;
  /** Brazil only: mobile or landline from the numbering plan. NANP numbers are `unknown`. */
  line: 'mobile' | 'landline' | 'unknown';
  /** True when an old 8-digit Brazilian mobile was given the leading 9 to compare. */
  ninthDigitAdded: boolean;
}

export interface NormalizePhoneOptions {
  /** Country assumed for numbers without a country code. Without it, ambiguous numbers fail. */
  defaultCountry?: PhoneCountry | undefined;
}

/** Brazilian area codes (DDD) in the Anatel numbering plan. */
const BR_AREA_CODES: ReadonlySet<string> = new Set(
  (
    '11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 ' +
    '51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 ' +
    '91 92 93 94 95 96 97 98 99'
  ).split(' '),
);

/**
 * Longest value accepted, after trimming. A number with a label and an extension stays under
 * ~40 characters.
 */
const MAX_PHONE_LENGTH = 64;

/**
 * Normalizes a Brazilian or NANP (US/Canada) phone number.
 *
 * An explicit country code (`+55`, `+1`, `00…`, `011…`) wins over `defaultCountry`. Without
 * either, the number is parsed for both countries and kept only if exactly one accepts it.
 *
 * Returns `undefined` for invalid numbers, numbers from other countries, service numbers
 * (Brazilian 0800/0300, NANP toll-free 8XX and 900), letters (including labels such as "Cel:"),
 * numbers without an area code, placeholders (one repeated digit) and values longer than 64
 * characters after trimming.
 */
export function normalizePhone(
  value: string,
  options: NormalizePhoneOptions = {},
): NormalizedPhone | undefined {
  const trimmed = value.normalize('NFKC').trim();
  // Incoming records are untrusted: bound the input before any regex runs on it.
  if (trimmed.length > MAX_PHONE_LENGTH) return undefined;
  const cleaned = trimmed
    .replace(/^tel:/i, '')
    // Extensions: "x204", "ramal 22", RFC 3966 ";ext=204". Each whitespace run has one way to
    // match (the old `\s*;?\s*` had many: cubic, ~0.5 s on 1,000 spaces). Still quadratic in
    // the worst case, which the length bound above keeps negligible.
    .replace(/\s*(?:;\s*)?(?:ext\.?|extension|ramal|x|r\.)\s*(?:[=:.]\s*)?\d+\s*$/i, '');
  if (/\p{L}/u.test(cleaned)) return undefined;

  const digits = cleaned.replace(/\D/g, '');
  if (digits === '') return undefined;

  // "+" anywhere before the first digit, so "(+55) 41 ..." counts as an explicit country code.
  const international = /^\D*\+/.test(cleaned)
    ? digits
    : digits.startsWith('00')
      ? digits.slice(2)
      : digits.startsWith('011') && digits.length >= 13
        ? digits.slice(3)
        : undefined;

  if (international !== undefined) {
    if (international.startsWith('55')) return parseBR(international.slice(2));
    if (international.startsWith('1')) return parseNANP(international.slice(1));
    return undefined;
  }

  if (options.defaultCountry === 'BR') return parseBrazilNational(digits);
  if (options.defaultCountry === 'US') return parseNanpNational(digits);

  const br = parseBrazilNational(digits);
  const us = parseNanpNational(digits);
  if (br !== undefined && us !== undefined) return undefined; // ambiguous
  return br ?? us;
}

/** Brazilian number without "+": may still carry 55, the trunk 0 and a carrier code. */
function parseBrazilNational(digits: string): NormalizedPhone | undefined {
  let n = digits;
  if ((n.length === 12 || n.length === 13) && n.startsWith('55')) {
    n = n.slice(2); // country code without "+"
  } else if (n.startsWith('0')) {
    n = n.slice(1); // trunk prefix
    if (n.length === 12 || n.length === 13) n = n.slice(2); // carrier selection code
  }
  return parseBR(n);
}

/** Brazilian national significant number: DDD + 8 or 9 digits. */
function parseBR(n: string): NormalizedPhone | undefined {
  if (n.length !== 10 && n.length !== 11) return undefined;
  const ddd = n.slice(0, 2);
  const subscriber = n.slice(2);
  if (!BR_AREA_CODES.has(ddd)) return undefined;
  if (isRepeatedDigits(subscriber.slice(-8))) return undefined;

  if (subscriber.length === 9) {
    if (!subscriber.startsWith('9')) return undefined;
    return { e164: `+55${ddd}${subscriber}`, line: 'mobile', ninthDigitAdded: false };
  }
  if (/^[2-5]/.test(subscriber)) {
    return { e164: `+55${ddd}${subscriber}`, line: 'landline', ninthDigitAdded: false };
  }
  if (/^[6-9]/.test(subscriber)) {
    return { e164: `+55${ddd}9${subscriber}`, line: 'mobile', ninthDigitAdded: true };
  }
  return undefined;
}

/** NANP number without "+": may carry the trunk/country 1. */
function parseNanpNational(digits: string): NormalizedPhone | undefined {
  return parseNANP(digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits);
}

/** NANP national number: NPA (area code) + NXX (exchange) + 4-digit line. */
function parseNANP(n: string): NormalizedPhone | undefined {
  if (n.length !== 10) return undefined;
  const npa = n.slice(0, 3);
  const nxx = n.slice(3, 6);
  if (!/^[2-9][0-8]\d$/.test(npa) || npa.endsWith('11')) return undefined;
  if (/^8(\d)\1$/.test(npa) || npa === '900') return undefined; // toll-free 8XX, premium 900
  if (!/^[2-9]\d\d$/.test(nxx) || nxx.endsWith('11')) return undefined;
  if (isRepeatedDigits(n.slice(3))) return undefined;
  return { e164: `+1${n}`, line: 'unknown', ninthDigitAdded: false };
}
