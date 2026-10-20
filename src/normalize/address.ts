import type { AddressLike } from '../types/fhir.js';
import { isRepeatedDigits, PLACEHOLDER_ADDRESS_TEXT } from './placeholders.js';
import { normalizeText, tokenize } from './text.js';

/** Countries whose postal codes and street abbreviations are understood. */
export type AddressCountry = 'BR' | 'US';

export interface NormalizedAddress {
  /** `Address.line` joined and folded, with street abbreviations expanded for the country. */
  line: string | undefined;
  city: string | undefined;
  /** Folded only: `PR` and `Paraná` stay different. */
  state: string | undefined;
  /** CEP as 8 digits; ZIP as its first 5 digits; other countries folded without spaces. */
  postalCode: string | undefined;
  /** From `Address.country`, or inferred from the postal code shape when that is absent. */
  country: AddressCountry | undefined;
}

// Maps, not object literals: a token such as "constructor" must not hit Object.prototype.
const COUNTRY_NAMES: ReadonlyMap<string, AddressCountry> = new Map(
  Object.entries<AddressCountry>({
    br: 'BR',
    bra: 'BR',
    brasil: 'BR',
    brazil: 'BR',
    'republica federativa do brasil': 'BR',
    us: 'US',
    usa: 'US',
    'u s': 'US',
    'u s a': 'US',
    'united states': 'US',
    'united states of america': 'US',
    eua: 'US',
    'estados unidos': 'US',
  }),
);

/** Correios street types and common words in Brazilian street names. */
const BR_ABBREVIATIONS: ReadonlyMap<string, string> = new Map(
  Object.entries({
    r: 'rua',
    av: 'avenida',
    al: 'alameda',
    tv: 'travessa',
    trav: 'travessa',
    rod: 'rodovia',
    est: 'estrada',
    estr: 'estrada',
    pc: 'praca',
    pca: 'praca',
    lg: 'largo',
    lgo: 'largo',
    vl: 'vila',
    jd: 'jardim',
    jard: 'jardim',
    pq: 'parque',
    cj: 'conjunto',
    conj: 'conjunto',
    qd: 'quadra',
    lt: 'lote',
    ap: 'apartamento',
    apto: 'apartamento',
    apt: 'apartamento',
    bl: 'bloco',
    sl: 'sala',
    dr: 'doutor',
    dra: 'doutora',
    prof: 'professor',
    profa: 'professora',
    eng: 'engenheiro',
    cel: 'coronel',
    gal: 'general',
    gen: 'general',
    sta: 'santa',
    sto: 'santo',
  }),
);

/** USPS Publication 28: street suffixes, secondary unit designators and directionals. */
const US_ABBREVIATIONS: ReadonlyMap<string, string> = new Map(
  Object.entries({
    st: 'street',
    ave: 'avenue',
    av: 'avenue',
    rd: 'road',
    blvd: 'boulevard',
    dr: 'drive',
    ln: 'lane',
    ct: 'court',
    pl: 'place',
    sq: 'square',
    ter: 'terrace',
    cir: 'circle',
    hwy: 'highway',
    pkwy: 'parkway',
    apt: 'apartment',
    ste: 'suite',
    fl: 'floor',
    bldg: 'building',
    n: 'north',
    s: 'south',
    e: 'east',
    w: 'west',
    ne: 'northeast',
    nw: 'northwest',
    se: 'southeast',
    sw: 'southwest',
  }),
);

/**
 * Brazil: "nº 100", "no. 100", "número 100": markers are dropped before a number. Not used
 * for US addresses, where "N 5th St" means North.
 */
const NUMBER_MARKERS: ReadonlySet<string> = new Set(['n', 'no', 'nro', 'num', 'numero']);

/**
 * Light address normalization for comparison: postal code plus a folded street line.
 * No geocoding and no fuzzy parsing.
 *
 * - The country comes from `Address.country` (`BR`, `Brasil`, `USA`, ...) or, when absent, from
 *   the postal code: 8 digits is a CEP, 5 or 9 digits is a ZIP. Other countries are kept as
 *   folded text, without abbreviation rules.
 * - A postal code that does not fit its country, or is one repeated digit, is `undefined`.
 * - `Address.text` is not parsed: a text-only address returns `undefined`.
 *
 * Returns `undefined` when no line, city or postal code is usable.
 */
export function normalizeAddress(address: AddressLike): NormalizedAddress | undefined {
  const explicit = parseCountry(address.country);
  const postal = parsePostalCode(address.postalCode, explicit);
  const country = explicit === 'other' ? undefined : (explicit ?? postal.country);

  const result: NormalizedAddress = {
    line: normalizeLine(address.line ?? [], country),
    city: usableText(address.city),
    state: usableText(address.state),
    postalCode: postal.code,
    country,
  };
  if (result.line === undefined && result.city === undefined && result.postalCode === undefined) {
    return undefined;
  }
  return result;
}

function parseCountry(value: string | undefined): AddressCountry | 'other' | undefined {
  const text = normalizeText(value ?? '');
  if (text === '') return undefined;
  return COUNTRY_NAMES.get(text) ?? 'other';
}

function parsePostalCode(
  value: string | undefined,
  country: AddressCountry | 'other' | undefined,
): { code: string | undefined; country: AddressCountry | undefined } {
  const none = { code: undefined, country: undefined };
  if (value === undefined) return none;
  const compact = value.normalize('NFKC').replace(/[\s.]/g, '');
  const isCep = /^\d{5}-?\d{3}$/.test(compact);
  const isZip = /^\d{5}(?:-?\d{4})?$/.test(compact);

  if (country === 'BR' || (country === undefined && isCep)) {
    const cep = compact.replace('-', '');
    // CEPs start at 01000-000.
    if (!isCep || isRepeatedDigits(cep) || cep.startsWith('00')) return none;
    return { code: cep, country: 'BR' };
  }
  if (country === 'US' || (country === undefined && isZip)) {
    const zip = compact.slice(0, 5);
    // ZIP codes start at 00501; the 000 prefix is unassigned.
    if (!isZip || isRepeatedDigits(zip) || zip.startsWith('000')) return none;
    return { code: zip, country: 'US' };
  }
  const folded = normalizeText(value).replaceAll(' ', '');
  return { code: folded === '' ? undefined : folded, country: undefined };
}

function normalizeLine(
  lines: readonly string[],
  country: AddressCountry | undefined,
): string | undefined {
  // Placeholders are checked per entry and as written: a second line of "N/A" is common, and
  // expanded it would become "north a".
  const tokens = tokenize(lines.filter((line) => usableText(line) !== undefined).join(' '));
  if (tokens.length === 0) return undefined;
  const abbreviations =
    country === 'BR' ? BR_ABBREVIATIONS : country === 'US' ? US_ABBREVIATIONS : new Map();
  const words = (country === 'BR' ? dropNumberMarkers(tokens) : tokens).map(
    (t) => abbreviations.get(t) ?? t,
  );
  return words.join(' ');
}

/** Drops a run of number markers that ends in a number ("no nº 5" -> "5"). */
function dropNumberMarkers(tokens: readonly string[]): string[] {
  // One backward pass: `beforeNumber` says whether the first non-marker token after the current
  // position starts with a digit. Scanning forward from each marker would be quadratic.
  const kept: string[] = [];
  let beforeNumber = false;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i] ?? '';
    if (!NUMBER_MARKERS.has(token)) {
      beforeNumber = /^\d/.test(token);
      kept.push(token);
    } else if (!beforeNumber) {
      kept.push(token);
    }
  }
  return kept.reverse();
}

function usableText(value: string | undefined): string | undefined {
  const text = normalizeText(value ?? '');
  return text === '' || PLACEHOLDER_ADDRESS_TEXT.has(text) ? undefined : text;
}
