/**
 * Minimal structural subset of FHIR R4 `Patient`, covering only the demographic
 * fields this library reads. See docs/adr/0001-own-fhir-types.md.
 *
 * These types must stay supertypes of `Patient` from `@types/fhir` (R4 and R5) and
 * `@medplum/fhirtypes`, under both `exactOptionalPropertyTypes: true` and `false`.
 * Rules, enforced by test/types:
 *  - every optional property is `?: T | undefined`;
 *  - no index signatures;
 *  - nested code fields are `string`, not unions of codes;
 *  - arrays are `readonly`, so `as const` literals are accepted (inputs are never mutated).
 */

/** `T | undefined`, spelled out so optional properties accept an explicit `undefined`. */
type Opt<T> = T | undefined;

export interface CodingLike {
  system?: Opt<string>;
  code?: Opt<string>;
  display?: Opt<string>;
}

export interface CodeableConceptLike {
  coding?: Opt<readonly CodingLike[]>;
  text?: Opt<string>;
}

export interface IdentifierLike {
  use?: Opt<string>;
  type?: Opt<CodeableConceptLike>;
  system?: Opt<string>;
  value?: Opt<string>;
}

export interface HumanNameLike {
  use?: Opt<string>;
  text?: Opt<string>;
  family?: Opt<string>;
  given?: Opt<readonly string[]>;
  prefix?: Opt<readonly string[]>;
  suffix?: Opt<readonly string[]>;
}

export interface ContactPointLike {
  system?: Opt<string>;
  value?: Opt<string>;
  use?: Opt<string>;
  rank?: Opt<number>;
}

export interface AddressLike {
  use?: Opt<string>;
  type?: Opt<string>;
  text?: Opt<string>;
  line?: Opt<readonly string[]>;
  city?: Opt<string>;
  district?: Opt<string>;
  state?: Opt<string>;
  postalCode?: Opt<string>;
  country?: Opt<string>;
}

export type AdministrativeGender = 'male' | 'female' | 'other' | 'unknown';

export interface PatientLike {
  readonly resourceType: 'Patient';
  id?: Opt<string>;
  identifier?: Opt<readonly IdentifierLike[]>;
  name?: Opt<readonly HumanNameLike[]>;
  telecom?: Opt<readonly ContactPointLike[]>;
  gender?: Opt<AdministrativeGender>;
  birthDate?: Opt<string>;
  address?: Opt<readonly AddressLike[]>;
}
