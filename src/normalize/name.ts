import type { HumanNameLike } from '../types/fhir.js';
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

/** Portuguese particles, dropped only when they sit between two names. */
const PARTICLES: ReadonlySet<string> = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

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

/** Titles dropped from the start of `HumanName.text`. Structured `prefix` is ignored anyway. */
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
 * - Particles (da, de, do, das, dos, e) are dropped only between two names.
 * - `prefix` is ignored.
 *
 * Returns `undefined` when nothing usable remains.
 */
export function normalizeName(name: HumanNameLike): NormalizedName | undefined {
  const given = (name.given ?? []).flatMap(tokenize);
  const family = tokenize(name.family ?? '');
  if (given.length > 0 || family.length > 0) {
    return fromParts(given, family, suffixFromField(name.suffix ?? []));
  }
  return fromText(tokenize(name.text ?? ''));
}

function fromParts(
  given: string[],
  family: string[],
  fieldSuffix: GenerationalSuffix | undefined,
): NormalizedName {
  const { rest: familyNames, suffix: trailing } = stripTrailingSuffixes(family, 1);

  const sequence = [...given, ...familyNames];
  const keep = innerParticleMask(sequence).map((dropped) => !dropped);
  const keptGiven = given.filter((_, i) => keep[i]);
  const keptFamily = familyNames.filter((_, i) => keep[given.length + i]);

  return {
    given: keptGiven[0],
    middle: keptGiven.slice(1),
    family: keptFamily,
    suffix: fieldSuffix ?? trailing,
    source: 'parts',
  };
}

function fromText(tokens: string[]): NormalizedName | undefined {
  let words: readonly string[] = tokens;
  if (words.length > 1 && TITLES.has(words[0] ?? '')) words = words.slice(1);

  // Only a suffix when a first name and a family name both remain ("José Neto" keeps Neto).
  const stripped = stripTrailingSuffixes(words, 2);
  const trailing = stripped.suffix;
  words = stripped.rest;

  words = dropInnerParticles(words);
  if (words.length === 0) return undefined;

  return {
    given: words[0],
    middle: words.slice(1, -1),
    family: words.length > 1 ? words.slice(-1) : [],
    suffix: trailing,
    source: 'text',
  };
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

/** Drops particles that have a non-particle token somewhere before and after them. */
function dropInnerParticles(tokens: readonly string[]): string[] {
  const dropped = innerParticleMask(tokens);
  return tokens.filter((_, i) => !dropped[i]);
}

/** `true` at each particle that has a non-particle token somewhere before and after it. */
function innerParticleMask(tokens: readonly string[]): boolean[] {
  const first = tokens.findIndex((t) => !PARTICLES.has(t));
  const last = tokens.findLastIndex((t) => !PARTICLES.has(t));
  return tokens.map((t, i) => PARTICLES.has(t) && i > first && i < last);
}
