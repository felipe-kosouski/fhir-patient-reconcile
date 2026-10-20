import type { NormalizedName } from '../../normalize/name.js';
import { jaroWinkler } from '../../similarity/jaro-winkler.js';
import { fieldResult, type MatchContext } from '../context.js';
import type { FieldResult } from '../types.js';

export interface NameComparison {
  given: FieldResult;
  family: FieldResult;
  middle: FieldResult;
  /** The name pair the results come from, for the suffix veto. Absent when nothing compared. */
  pair?: readonly [NormalizedName, NormalizedName];
}

/**
 * Longer tokens are compared for equality only. Jaro-Winkler costs |a| x |b|, and no real name
 * token comes near this length.
 */
const MAX_FUZZY_LENGTH = 100;

/**
 * Compares every local name with every incoming name and keeps the pair with the most points,
 * so a maiden name kept in `name[]` still matches. Given, family and middle always come from
 * the same pair, never mixed. Ties keep the first pair in input order.
 */
export function compareNames(
  local: readonly NormalizedName[],
  incoming: readonly NormalizedName[],
  ctx: MatchContext,
): NameComparison {
  let best: NameComparison | undefined;
  let bestPoints = Number.NEGATIVE_INFINITY;
  for (const a of local) {
    for (const b of incoming) {
      const results = {
        given: compareGiven(a, b, ctx),
        family: compareFamily(a, b, ctx),
        middle: compareMiddle(a, b, ctx),
      };
      const all = [results.given, results.family, results.middle];
      if (all.every((r) => r.outcome === 'missing')) continue;
      const points = all.reduce((sum, r) => sum + r.points, 0);
      if (points > bestPoints) {
        best = { ...results, pair: [a, b] };
        bestPoints = points;
      }
    }
  }
  return (
    best ?? {
      given: fieldResult(ctx, 'given', 'missing', 'no comparable name on one or both sides'),
      family: fieldResult(ctx, 'family', 'missing', 'no comparable name on one or both sides'),
      middle: fieldResult(ctx, 'middle', 'missing', 'no comparable name on one or both sides'),
    }
  );
}

function compareGiven(a: NormalizedName, b: NormalizedName, ctx: MatchContext): FieldResult {
  const values = { local: a.given, incoming: b.given };
  if (a.given === undefined || b.given === undefined) {
    return fieldResult(ctx, 'given', 'missing', 'no first given name on one or both sides', values);
  }
  if (a.given === b.given) {
    return fieldResult(ctx, 'given', 'exact', 'first given names are equal', values);
  }
  const similarity = tokenSimilarity(a.given, b.given);
  if (similarity >= ctx.fuzzyMin) {
    return fieldResult(ctx, 'given', 'fuzzy', 'first given names are similar', {
      ...values,
      similarity,
    });
  }
  return fieldResult(ctx, 'given', 'conflict', 'first given names differ', {
    ...values,
    similarity,
  });
}

/**
 * Brazilian names carry several family names, and records often keep only some of them, so the
 * family names are compared as sets: one set inside the other is `exact`, a partial overlap or a
 * near spelling is `fuzzy`. For a name parsed from `text` the split is a guess, so its middle
 * tokens count as family names too.
 */
function compareFamily(a: NormalizedName, b: NormalizedName, ctx: MatchContext): FieldResult {
  const fa = new Set(familyTokens(a));
  const fb = new Set(familyTokens(b));
  const values = { local: joined([...fa]), incoming: joined([...fb]) };
  if (fa.size === 0 || fb.size === 0) {
    return fieldResult(ctx, 'family', 'missing', 'no family name on one or both sides', values);
  }
  const shared = [...fa].filter((t) => fb.has(t)).length;
  if (shared === fa.size || shared === fb.size) {
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
  const similarity = bestSimilarity(fa, fb);
  if (similarity >= ctx.fuzzyMin) {
    return fieldResult(ctx, 'family', 'fuzzy', 'family names are similar', {
      ...values,
      similarity,
    });
  }
  return fieldResult(ctx, 'family', 'conflict', 'no family name in common', {
    ...values,
    similarity,
  });
}

/** A missing middle name is never a disagreement; a middle initial agrees with the full name. */
function compareMiddle(a: NormalizedName, b: NormalizedName, ctx: MatchContext): FieldResult {
  const values = { local: joined(a.middle), incoming: joined(b.middle) };
  if (a.middle.length === 0 || b.middle.length === 0) {
    return fieldResult(ctx, 'middle', 'missing', 'no middle name on one or both sides', values);
  }
  if (a.middle.some((t) => b.middle.includes(t))) {
    return fieldResult(ctx, 'middle', 'exact', 'a middle name is shared', values);
  }
  if (a.middle.some((t) => b.middle.some((u) => isInitialOf(t, u) || isInitialOf(u, t)))) {
    return fieldResult(ctx, 'middle', 'fuzzy', 'a middle initial agrees', values);
  }
  const similarity = bestSimilarity(a.middle, b.middle);
  if (similarity >= ctx.fuzzyMin) {
    return fieldResult(ctx, 'middle', 'fuzzy', 'middle names are similar', {
      ...values,
      similarity,
    });
  }
  return fieldResult(ctx, 'middle', 'conflict', 'middle names differ', { ...values, similarity });
}

function familyTokens(name: NormalizedName): readonly string[] {
  return name.source === 'text' ? [...name.middle, ...name.family] : name.family;
}

function joined(tokens: readonly string[]): string | undefined {
  return tokens.length === 0 ? undefined : tokens.join(' ');
}

/** `p` is an initial of `pedro`. */
function isInitialOf(initial: string, name: string): boolean {
  const chars = Array.from(initial);
  return chars.length === 1 && Array.from(name).length > 1 && name.startsWith(initial);
}

function bestSimilarity(a: Iterable<string>, b: Iterable<string>): number {
  let best = 0;
  const others = [...b];
  for (const x of a) for (const y of others) best = Math.max(best, tokenSimilarity(x, y));
  return best;
}

function tokenSimilarity(a: string, b: string): number {
  if (a.length > MAX_FUZZY_LENGTH || b.length > MAX_FUZZY_LENGTH) return a === b ? 1 : 0;
  return jaroWinkler(a, b);
}
