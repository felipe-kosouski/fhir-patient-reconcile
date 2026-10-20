// Values that systems store when the real one is unknown. They must count as *missing*:
// two records that both say "noemail@..." or "UNKNOWN" do not agree on anything.

/** Portuguese particles. Shared with name normalization. */
export const PARTICLES: ReadonlySet<string> = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

/** Whole name parts that mean "unknown", compared without particles. */
const UNKNOWN_NAME_PARTS: ReadonlySet<string> = new Set([
  'unknown',
  'desconhecido',
  'desconhecida',
  'ignorado',
  'ignorada',
  'nao informado',
  'nao informada',
  'nao identificado',
  'nao identificada',
  'sem nome',
]);

/** Whole names used for unidentified people, compared without particles. */
const PLACEHOLDER_FULL_NAMES: ReadonlySet<string> = new Set([
  'john doe',
  'jane doe',
  'fulano tal', // Fulano de Tal
  'fulana tal',
  'beltrano tal',
  'sicrano tal',
]);

/** Name openings for newborns registered before they have a name. */
const NEWBORN_WITH_PARTICLE: ReadonlySet<string> = new Set(['rn', 'bebe']); // "RN de Maria"
const NEWBORN_PREFIXES: readonly (readonly string[])[] = [
  ['recem', 'nascido'],
  ['recem', 'nascida'],
  ['newborn'],
  ['baby', 'boy'],
  ['baby', 'girl'],
];

const withoutParticles = (tokens: readonly string[]): string[] =>
  tokens.filter((t) => !PARTICLES.has(t));

/** True when a whole name part (all given names, or the family names) means "unknown". */
export function isPlaceholderNamePart(tokens: readonly string[]): boolean {
  return UNKNOWN_NAME_PARTS.has(withoutParticles(tokens).join(' '));
}

/** True when a full name (given + family tokens, in order) is a placeholder. */
export function isPlaceholderFullName(tokens: readonly string[]): boolean {
  // "RN de Maria", but not "Bebe Souza": Bebe alone can be a real first name.
  if (NEWBORN_WITH_PARTICLE.has(tokens[0] ?? '') && PARTICLES.has(tokens[1] ?? '')) return true;
  const words = withoutParticles(tokens);
  if (PLACEHOLDER_FULL_NAMES.has(words.join(' '))) return true;
  return NEWBORN_PREFIXES.some((prefix) => prefix.every((word, i) => words[i] === word));
}

/** True when the digits are one repeated digit (99999-9999, 000.000.000-00, 00000-000). */
export function isRepeatedDigits(digits: string): boolean {
  return /^(\d)\1*$/.test(digits);
}

const PLACEHOLDER_EMAIL_LOCALS: ReadonlySet<string> = new Set([
  'noemail',
  'nomail',
  'none',
  'null',
  'sememail',
  'naotem',
  'naopossui',
  'naoinformado',
  'nenhum',
]);
const PLACEHOLDER_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'noemail.com',
  'nomail.com',
  'none.com',
  'sememail.com',
  'naotem.com',
]);

/** True for addresses such as noemail@..., sem.email@..., anything@noemail.com. */
export function isPlaceholderEmail(local: string, domain: string): boolean {
  return (
    PLACEHOLDER_EMAIL_LOCALS.has(local.replace(/[^a-z0-9]/g, '')) ||
    PLACEHOLDER_EMAIL_DOMAINS.has(domain)
  );
}

/** Valid-checksum CPFs typed as fakes: ascending sequences. Repeated digits are checked apart. */
export const PLACEHOLDER_CPFS: ReadonlySet<string> = new Set(['12345678909', '01234567890']);

/** Whole address lines or cities that mean "unknown", after `normalizeText`. */
export const PLACEHOLDER_ADDRESS_TEXT: ReadonlySet<string> = new Set([
  'unknown',
  'none',
  'n a',
  'na',
  'desconhecido',
  'ignorado',
  'nenhum',
  'nao informado',
  'nao informada',
  'sem endereco',
  'endereco nao informado',
  's n',
]);

/** Birth dates that systems use as "unknown". Years before 1900 are rejected separately. */
export const PLACEHOLDER_BIRTH_DATES: ReadonlySet<string> = new Set(['1900-01-01']);
