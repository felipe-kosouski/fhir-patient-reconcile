import type { GenerationalSuffix, NormalizedName } from '../../normalize/name.js';
import { jaroWinkler } from '../../similarity/jaro-winkler.js';
import { fieldResult, type MatchContext } from '../context.js';
import type { FieldResult } from '../types.js';

export interface NameComparison {
  given: FieldResult;
  family: FieldResult;
  middle: FieldResult;
  /** The chosen name pair carries different generations (Jr. vs Sr., Filho vs Neto). */
  suffixConflict: boolean;
}

/**
 * Júnior and Filho both mark a son registered with his father's exact name: the same generation,
 * chosen at registration, so they never conflict with each other (owner decision, session 8).
 */
const SAME_GENERATION: ReadonlySet<GenerationalSuffix> = new Set(['junior', 'filho']);

/** Both names carry a generational suffix, and the suffixes name different generations. */
export function suffixesConflict(a: NormalizedName, b: NormalizedName): boolean {
  if (a.suffix === undefined || b.suffix === undefined || a.suffix === b.suffix) return false;
  return !(SAME_GENERATION.has(a.suffix) && SAME_GENERATION.has(b.suffix));
}

/**
 * Longer tokens are compared for equality only. Jaro-Winkler costs |a| x |b|, and no real name
 * token comes near this length.
 */
const MAX_FUZZY_LENGTH = 40;

/**
 * Jaro-Winkler runs on at most this many tokens per name part (every pair of them). Set
 * equality still uses every token; real name parts have a handful.
 */
const MAX_FUZZY_TOKENS = 10;

/** A name with its token sets built once, not once per pair. */
interface PreparedName {
  name: NormalizedName;
  family: ReadonlySet<string>;
  middle: ReadonlySet<string>;
  fuzzyFamily: readonly string[];
  fuzzyMiddle: readonly string[];
}

/**
 * Compares every local name with every incoming name and keeps the pair with the most points,
 * so a maiden name kept in `name[]` still matches. Given, family and middle always come from
 * the same pair, never mixed.
 *
 * On a tie in points, a pair whose suffixes conflict wins (then the first in input order): the
 * veto must not depend on argument order, and when in doubt it should fire.
 */
export function compareNames(
  local: readonly NormalizedName[],
  incoming: readonly NormalizedName[],
  ctx: MatchContext,
): NameComparison {
  const prepared = (names: readonly NormalizedName[]) => names.map(prepareName);
  const incomingNames = prepared(incoming);
  let best: NameComparison | undefined;
  let bestPoints = Number.NEGATIVE_INFINITY;
  for (const a of prepared(local)) {
    for (const b of incomingNames) {
      const results = {
        given: compareGiven(a.name, b.name, ctx),
        family: compareFamily(a, b, ctx),
        middle: compareMiddle(a, b, ctx),
      };
      const all = [results.given, results.family, results.middle];
      if (all.every((r) => r.outcome === 'missing')) continue;
      const points = all.reduce((sum, r) => sum + r.points, 0);
      const suffixConflict = suffixesConflict(a.name, b.name);
      const breaksTie =
        points === bestPoints && suffixConflict && best !== undefined && !best.suffixConflict;
      if (points > bestPoints || breaksTie) {
        best = { ...results, suffixConflict };
        bestPoints = points;
      }
    }
  }
  return (
    best ?? {
      given: fieldResult(ctx, 'given', 'missing', 'no comparable name on one or both sides'),
      family: fieldResult(ctx, 'family', 'missing', 'no comparable name on one or both sides'),
      middle: fieldResult(ctx, 'middle', 'missing', 'no comparable name on one or both sides'),
      suffixConflict: false,
    }
  );
}

function prepareName(name: NormalizedName): PreparedName {
  // For a name parsed from `text` the split is a guess, so its middle tokens count as family
  // names too.
  const family = new Set(name.source === 'text' ? [...name.middle, ...name.family] : name.family);
  const middle = new Set(name.middle);
  return {
    name,
    family,
    middle,
    fuzzyFamily: [...family].slice(0, MAX_FUZZY_TOKENS),
    fuzzyMiddle: [...middle].slice(0, MAX_FUZZY_TOKENS),
  };
}

function compareGiven(a: NormalizedName, b: NormalizedName, ctx: MatchContext): FieldResult {
  const values = () => ({ local: a.given, incoming: b.given });
  if (a.given === undefined || b.given === undefined) {
    return fieldResult(ctx, 'given', 'missing', 'no first given name on one or both sides', values);
  }
  if (a.given === b.given) {
    return fieldResult(ctx, 'given', 'exact', 'first given names are equal', values);
  }
  const similarity = tokenSimilarity(a.given, b.given);
  if (isGenderedPair(a.given, b.given)) {
    return fieldResult(
      ctx,
      'given',
      'conflict',
      'first given names are the masculine and feminine forms of one name',
      values,
      similarity,
    );
  }
  return similarity >= ctx.fuzzyMin
    ? fieldResult(ctx, 'given', 'fuzzy', 'first given names are similar', values, similarity)
    : fieldResult(ctx, 'given', 'conflict', 'first given names differ', values, similarity);
}

/**
 * Brazilian names carry several family names, and records often keep only some of them, so the
 * family names are compared as sets: one set inside the other is `exact`, a partial overlap or a
 * near spelling is `fuzzy`.
 */
function compareFamily(a: PreparedName, b: PreparedName, ctx: MatchContext): FieldResult {
  const values = () => ({ local: joined(a.family), incoming: joined(b.family) });
  if (a.family.size === 0 || b.family.size === 0) {
    return fieldResult(ctx, 'family', 'missing', 'no family name on one or both sides', values);
  }
  const shared = sharedCount(a.family, b.family);
  if (shared === a.family.size || shared === b.family.size) {
    return fieldResult(
      ctx,
      'family',
      'exact',
      'every family name on one side appears on the other',
      values,
    );
  }
  if (shared > 0) {
    return fieldResult(ctx, 'family', 'fuzzy', 'some family names are shared', values);
  }
  const similarity = bestSimilarity(a.fuzzyFamily, b.fuzzyFamily);
  return similarity >= ctx.fuzzyMin
    ? fieldResult(ctx, 'family', 'fuzzy', 'family names are similar', values, similarity)
    : fieldResult(ctx, 'family', 'conflict', 'no family name in common', values, similarity);
}

/** A missing middle name is never a disagreement; a middle initial agrees with the full name. */
function compareMiddle(a: PreparedName, b: PreparedName, ctx: MatchContext): FieldResult {
  const values = () => ({ local: joined(a.middle), incoming: joined(b.middle) });
  if (a.middle.size === 0 || b.middle.size === 0) {
    return fieldResult(ctx, 'middle', 'missing', 'no middle name on one or both sides', values);
  }
  if (sharedCount(a.middle, b.middle) > 0) {
    return fieldResult(ctx, 'middle', 'exact', 'a middle name is shared', values);
  }
  const initials = a.fuzzyMiddle.some((t) =>
    b.fuzzyMiddle.some((u) => isInitialOf(t, u) || isInitialOf(u, t)),
  );
  if (initials) {
    return fieldResult(ctx, 'middle', 'fuzzy', 'a middle initial agrees', values);
  }
  const similarity = bestSimilarity(a.fuzzyMiddle, b.fuzzyMiddle, isGenderedPair);
  return similarity >= ctx.fuzzyMin
    ? fieldResult(ctx, 'middle', 'fuzzy', 'middle names are similar', values, similarity)
    : fieldResult(ctx, 'middle', 'conflict', 'middle names differ', values, similarity);
}

/** Counts elements of the smaller set found in the larger one. */
function sharedCount(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let count = 0;
  for (const token of small) if (large.has(token)) count++;
  return count;
}

function joined(tokens: ReadonlySet<string>): string | undefined {
  return tokens.size === 0 ? undefined : [...tokens].join(' ');
}

/** `p` is an initial of `pedro`. */
function isInitialOf(initial: string, name: string): boolean {
  return (
    Array.from(initial).length === 1 && Array.from(name).length > 1 && name.startsWith(initial)
  );
}

/** The highest similarity over all token pairs, ignoring the pairs `skip` rejects. */
function bestSimilarity(
  a: readonly string[],
  b: readonly string[],
  skip: (x: string, y: string) => boolean = () => false,
): number {
  let best = 0;
  for (const x of a) {
    for (const y of b) if (!skip(x, y)) best = Math.max(best, tokenSimilarity(x, y));
  }
  return best;
}

/**
 * Masculine and feminine forms of one given name: Paulo/Paula and Alexandre/Alexandra (o or e
 * against a), Daniel/Daniela and Paul/Paula (a added), Victor/Victoria (ia added). They score
 * 0.92 to 0.98 in Jaro-Winkler but usually name two people, such as boy/girl twins, so they are a
 * conflict, never a near spelling. Tokens are already folded (lowercase, no accents).
 */
export function isGenderedPair(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 3 && (long === `${short}a` || long === `${short}ia`)) return true;
  if (a.length !== b.length || a.length < 3 || a.slice(0, -1) !== b.slice(0, -1)) return false;
  const endings = new Set([a.at(-1), b.at(-1)]);
  return endings.has('a') && (endings.has('o') || endings.has('e'));
}

function tokenSimilarity(a: string, b: string): number {
  if (a.length > MAX_FUZZY_LENGTH || b.length > MAX_FUZZY_LENGTH) return a === b ? 1 : 0;
  return jaroWinkler(a, b);
}
