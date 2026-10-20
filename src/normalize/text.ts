/** Letters with no Unicode decomposition, folded by hand to their usual ASCII spelling. */
const UNDECOMPOSABLE: Readonly<Record<string, string>> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ı: 'i',
};

/**
 * Folds text for comparison: compatibility decomposition, lowercase, no combining marks
 * (accents), apostrophes removed, any other non-letter/non-digit run turned into one space,
 * trimmed. Idempotent. Non-Latin letters are kept.
 *
 * @example normalizeText("  D’Ávila-SOUZA ") // "davila souza"
 */
export function normalizeText(input: string): string {
  return (
    input
      // NFKD folds compatibility forms (full-width, ligatures); lowercase can expose new
      // decomposable characters, so decompose again before dropping the marks.
      .normalize('NFKD')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{M}+/gu, '')
      .replace(/[ßæœøłđðþı]/gu, (c) => UNDECOMPOSABLE[c] ?? c)
      .replace(/['’ʼ`]/gu, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  );
}

/** `normalizeText`, split into non-empty tokens. */
export function tokenize(input: string): string[] {
  const text = normalizeText(input);
  return text === '' ? [] : text.split(' ');
}

/**
 * Records arrive as FHIR JSON from outside, so a value typed `string` may hold anything at run
 * time. `null` is even legal inside arrays of primitives (`"given": ["Jim", null]` when the
 * parallel `_given` array carries an extension). Anything that is not a string reads as `''`.
 */
export function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** The strings in `values`; anything else (null entries, a non-array) is dropped. */
export function strings(values: unknown): string[] {
  return Array.isArray(values) ? values.filter((v): v is string => typeof v === 'string') : [];
}
