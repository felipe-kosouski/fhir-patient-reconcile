import type { HumanNameLike } from '../types/fhir.js';
import { isPlaceholderFullName, isPlaceholderNamePart, PARTICLES } from './placeholders.js';
import { tokenize } from './text.js';

/** Canonical generational suffixes. Jr./Júnior map to `junior`, Sr. to `senior`. */
export type GenerationalSuffix =
  | 'junior'
  | 'senior'
  | 'filho'
  | 'neto'
  | 'sobrinho'
  | 'ii'
  | 'iii'
  | 'iv';

/** A HumanName folded for comparison. Every token is already `normalizeText`-ed. */
export interface NormalizedName {
  /** First given name. */
  given: string | undefined;
  /** Remaining given names, in order. */
  middle: readonly string[];
  /** Family names, in order. Brazilian names often have several. */
  family: readonly string[];
  suffix: GenerationalSuffix | undefined;
  /**
   * `parts` when built from `given`/`family`; `text` when parsed from `HumanName.text`.
   * Text parsing guesses the split (first token = given, last token = family), so
   * comparators should treat `middle` and `family` from text as interchangeable.
   */
  source: 'parts' | 'text';
}

const GENERATIONAL: ReadonlyMap<string, GenerationalSuffix> = new Map([
  ['jr', 'junior'],
  ['jnr', 'junior'],
  ['junior', 'junior'],
  ['sr', 'senior'],
  ['snr', 'senior'],
  ['senior', 'senior'],
  ['filho', 'filho'],
  ['neto', 'neto'],
  ['sobrinho', 'sobrinho'],
  ['ii', 'ii'],
  ['iii', 'iii'],
  ['iv', 'iv'],
]);

/**
 * Titles dropped from the start of the given names or of `HumanName.text` (dirty data often puts
 * them there). Structured `prefix` is ignored anyway.
 */
const TITLES: ReadonlySet<string> = new Set([
  'dr',
  'dra',
  'sr',
  'sra',
  'srta',
  'prof',
  'profa',
  'mr',
  'mrs',
  'ms',
  'miss',
  'mx',
]);

/**
 * Normalizes one FHIR HumanName for matching.
 *
 * - Structured `given`/`family` win; `text` is only parsed when both are empty.
 * - A generational suffix is read from `suffix`, or from trailing family tokens while at least
 *   one family name remains. Given names are never read as suffixes ("Júnior" is a first name).
 * - Placeholders count as missing: a whole name part such as "UNKNOWN" or "Não Informado", and
 *   whole names such as "RN de Maria", "Baby Girl Smith", "John Doe", "Fulano de Tal".
 * - Particles (da, de, do, das, dos, e) are dropped only between two names.
 * - Leading titles (Dr., Sra., Mr. ...) are dropped from the given names and from `text`;
 *   `prefix` is ignored.
 *
 * Returns `undefined` when nothing usable remains.
 */
export function normalizeName(name: HumanNameLike): NormalizedName | undefined {
  const given = (name.given ?? []).flatMap(tokenize);
  const family = tokenize(name.family ?? '');
  if (given.length > 0 || family.length > 0) {
    const stripped = stripTrailingSuffixes(family, 1);
    return build(
      stripLeadingTitles(given),
      stripped.rest,
      suffixFromField(name.suffix ?? []) ?? stripped.suffix,
      'parts',
    );
  }
  return fromText(tokenize(name.text ?? ''));
}

/** Text has no structure: first token = given, last token = family, the rest = middle. */
function fromText(tokens: readonly string[]): NormalizedName | undefined {
  let words = stripLeadingTitles(tokens);

  // Only a suffix when a first name and a family name both remain ("José Neto" keeps Neto).
  const stripped = stripTrailingSuffixes(words, 2);
  words = stripped.rest;
  if (words.length <= 1) return build(words, [], stripped.suffix, 'text');
  return build(words.slice(0, -1), words.slice(-1), stripped.suffix, 'text');
}

/**
 * Shared by both sources, after suffixes are removed. The order matters for idempotence:
 * placeholder parts, then placeholder full names, then particles.
 */
function build(
  given: readonly string[],
  family: readonly string[],
  suffix: GenerationalSuffix | undefined,
  source: NormalizedName['source'],
): NormalizedName | undefined {
  const g = isPlaceholderNamePart(given) ? [] : given;
  const f = isPlaceholderNamePart(family) ? [] : family;
  const sequence = [...g, ...f];
  if (sequence.length === 0 || isPlaceholderFullName(sequence)) return undefined;

  const dropped = innerParticleMask(sequence);
  const keptGiven = g.filter((_, i) => !dropped[i]);
  const keptFamily = f.filter((_, i) => !dropped[g.length + i]);
  return {
    given: keptGiven[0],
    middle: keptGiven.slice(1),
    family: keptFamily,
    suffix,
    source,
  };
}

/** Drops leading titles while more than one token remains ("Dr" alone is kept). */
function stripLeadingTitles(tokens: readonly string[]): readonly string[] {
  let start = 0;
  while (tokens.length - start > 1 && TITLES.has(tokens[start] ?? '')) start++;
  return tokens.slice(start);
}

/**
 * Removes generational tokens from the end while at least `keep` tokens remain. Returns the
 * outermost (last) one. Stripping all of them keeps normalization idempotent.
 */
function stripTrailingSuffixes(
  tokens: readonly string[],
  keep: number,
): { rest: readonly string[]; suffix: GenerationalSuffix | undefined } {
  let end = tokens.length;
  while (end > keep && GENERATIONAL.has(tokens[end - 1] ?? '')) end--;
  const suffix = end < tokens.length ? GENERATIONAL.get(tokens.at(-1) ?? '') : undefined;
  return { rest: tokens.slice(0, end), suffix };
}

function suffixFromField(suffixes: readonly string[]): GenerationalSuffix | undefined {
  for (const token of suffixes.flatMap(tokenize)) {
    const suffix = GENERATIONAL.get(token);
    if (suffix !== undefined) return suffix;
  }
  return undefined;
}

/** `true` at each particle that has a non-particle token somewhere before and after it. */
function innerParticleMask(tokens: readonly string[]): boolean[] {
  const first = tokens.findIndex((t) => !PARTICLES.has(t));
  const last = tokens.findLastIndex((t) => !PARTICLES.has(t));
  return tokens.map((t, i) => PARTICLES.has(t) && i > first && i < last);
}
