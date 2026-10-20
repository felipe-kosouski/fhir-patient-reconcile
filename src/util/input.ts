/**
 * The object entries of a FHIR array. Records come from outside, so a `null` entry or a
 * non-array value reads as missing instead of throwing.
 */
export function objects<T extends object>(values: readonly T[] | undefined): T[] {
  return Array.isArray(values)
    ? values.filter((v): v is T => typeof v === 'object' && v !== null)
    : [];
}

/** Throws a RangeError for a key of `values` that `known` does not have (a typo in options). */
export function requireKnownKeys(values: object, known: object, name: string): void {
  for (const key of Object.keys(values)) {
    if (!Object.hasOwn(known, key)) {
      const allowed = Object.keys(known).join(', ');
      const path = name === 'options' ? key : `${name}.${key}`;
      throw new RangeError(`unknown option ${path} (expected one of: ${allowed})`);
    }
  }
}
