import { isPlaceholderEmail } from './placeholders.js';

/**
 * Normalizes an email address for comparison: NFKC, trimmed, `mailto:` removed, lowercased.
 * No provider-specific rules (Gmail dots, plus tags are kept).
 *
 * Returns `undefined` for anything that is not a plausible address (`local@domain.tld`) and
 * for placeholders such as `noemail@...`.
 */
export function normalizeEmail(value: string): string | undefined {
  const email = value
    .normalize('NFKC')
    .trim()
    .replace(/^mailto:/i, '')
    .toLowerCase();

  const parts = email.split('@');
  if (parts.length !== 2) return undefined;
  const [local = '', domain = ''] = parts;
  if (local === '' || /\s/.test(email)) return undefined;

  const labels = domain.split('.');
  if (labels.length < 2 || labels.some((label) => label === '')) return undefined;

  return isPlaceholderEmail(local, domain) ? undefined : email;
}
