import { isRepeatedDigits, PLACEHOLDER_CPFS } from './placeholders.js';

/** `Identifier.system` for CPF in the Brazilian national health data network (RNDS). */
export const RNDS_CPF_SYSTEM = 'http://rnds.saude.gov.br/fhir/r4/NamingSystem/cpf';

/**
 * Validates a Brazilian CPF and returns its 11 digits.
 *
 * Accepts digits with the usual separators (`111.444.777-35`, `11144477735`). Returns
 * `undefined` for other characters, a wrong length, a wrong check digit, and placeholders:
 * one repeated digit (`000.000.000-00`, which passes the checksum) and ascending sequences.
 * Missing leading zeros are not restored: a 10-digit value is rejected, not guessed.
 */
export function normalizeCpf(value: string): string | undefined {
  const cpf = value.normalize('NFKC').trim();
  if (!/^[\d.\-\s]+$/.test(cpf)) return undefined;
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11 || isRepeatedDigits(digits) || PLACEHOLDER_CPFS.has(digits)) {
    return undefined;
  }
  const valid =
    checkDigit(digits.slice(0, 9)) === digits[9] && checkDigit(digits.slice(0, 10)) === digits[10];
  return valid ? digits : undefined;
}

/** Mod-11 check digit: weights count down to 2 from the left; a result of 10 becomes 0. */
function checkDigit(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += Number(body[i]) * (body.length + 1 - i);
  return String(((sum * 10) % 11) % 10);
}
