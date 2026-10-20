import { isPlaceholderEmail } from './placeholders.js';

// RFC 5322 dot-atom (unquoted local part), extended to Unicode letters for internationalized
// addresses (RFC 6531). Quoted local parts and IP-literal domains are deliberately rejected.
const ATOM = "[\\p{L}\\p{M}\\p{N}!#$%&'*+/=?^_`{|}~-]+";
const LOCAL_PART = new RegExp(`^${ATOM}(?:\\.${ATOM})*$`, 'u');
/** Host-name label (RFC 1123): letters, digits and inner hyphens. */
const DOMAIN_LABEL = /^[\p{L}\p{M}\p{N}](?:[\p{L}\p{M}\p{N}-]*[\p{L}\p{M}\p{N}])?$/u;

/** RFC 5321 limits a mailbox (path) to 256 octets including the angle brackets: 254 characters. */
const MAX_EMAIL_LENGTH = 254;

/**
 * Normalizes an email address for comparison: NFKC, trimmed, `mailto:` removed, lowercased.
 * No provider-specific rules (Gmail dots, plus tags are kept).
 *
 * Returns `undefined` for anything that is not a plausible address and for placeholders such as
 * `noemail@...`. Plausible means: an unquoted RFC 5322 local part, and a domain of at least two
 * host-name labels whose last label contains a letter, 254 characters at most (RFC 5321).
 */
export function normalizeEmail(value: string): string | undefined {
  const email = value
    .normalize('NFKC')
    .trim()
    .replace(/^mailto:/i, '')
    .toLowerCase();

  if (email.length > MAX_EMAIL_LENGTH) return undefined;
  const parts = email.split('@');
  if (parts.length !== 2) return undefined;
  const [local = '', domain = ''] = parts;
  if (!LOCAL_PART.test(local)) return undefined;

  const labels = domain.split('.');
  if (labels.length < 2 || !labels.every((label) => DOMAIN_LABEL.test(label))) return undefined;
  if (!/\p{L}/u.test(labels.at(-1) ?? '')) return undefined;

  return isPlaceholderEmail(local, domain) ? undefined : email;
}
