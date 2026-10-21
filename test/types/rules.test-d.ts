// Checks the PatientLike design rules directly, not only through third-party packages,
// so a new property that breaks a rule fails here even if no external type exercises it.
// Strict-mode only: the `| undefined` rule is invisible without exactOptionalPropertyTypes.
import { describe, expectTypeOf, it } from 'vitest';
import type {
  AddressLike,
  ArrayPolicies,
  CodeableConceptLike,
  CodingLike,
  ContactPointLike,
  FieldWeightOverrides,
  HumanNameLike,
  IdentifierLike,
  MatchOptions,
  MergeOptions,
  PatientLike,
} from '../../src/index.js';

type OptionalKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? K : never }[keyof T];

/**
 * `true` when every optional property of T accepts an explicit `undefined`; otherwise the
 * offending keys. Under exactOptionalPropertyTypes, `Required` keeps an explicit `| undefined`
 * and drops only the implicit one, which is what tells `?: T` apart from `?: T | undefined`.
 */
type OptionalsAcceptUndefined<T> =
  | { [K in OptionalKeys<T>]-?: undefined extends Required<T>[K] ? true : K }[OptionalKeys<T>]
  | true;

type HasIndexSignature<T> = string extends keyof T ? true : number extends keyof T ? true : false;

describe('every optional property is `?: T | undefined`', () => {
  // One assertion per type; a failure names the offending keys in the type error.
  it('on every public input type', () => {
    expectTypeOf<OptionalsAcceptUndefined<PatientLike>>().toEqualTypeOf<true>();
    expectTypeOf<OptionalsAcceptUndefined<IdentifierLike>>().toEqualTypeOf<true>();
    expectTypeOf<OptionalsAcceptUndefined<CodeableConceptLike>>().toEqualTypeOf<true>();
    expectTypeOf<OptionalsAcceptUndefined<CodingLike>>().toEqualTypeOf<true>();
    expectTypeOf<OptionalsAcceptUndefined<HumanNameLike>>().toEqualTypeOf<true>();
    expectTypeOf<OptionalsAcceptUndefined<ContactPointLike>>().toEqualTypeOf<true>();
    expectTypeOf<OptionalsAcceptUndefined<AddressLike>>().toEqualTypeOf<true>();
  });

  it('on MatchOptions and its nested objects (callers build them too)', () => {
    type Nested = Required<MatchOptions>;
    expectTypeOf<OptionalsAcceptUndefined<MatchOptions>>().toEqualTypeOf<true>();
    expectTypeOf<
      OptionalsAcceptUndefined<Exclude<Nested['identifierSystems'], undefined>>
    >().toEqualTypeOf<true>();
    expectTypeOf<
      OptionalsAcceptUndefined<Exclude<Nested['nameSimilarity'], undefined>>
    >().toEqualTypeOf<true>();
    expectTypeOf<
      OptionalsAcceptUndefined<Exclude<Nested['thresholds'], undefined>>
    >().toEqualTypeOf<true>();
    expectTypeOf<
      OptionalsAcceptUndefined<Exclude<Nested['weights'], undefined>>
    >().toEqualTypeOf<true>();
    expectTypeOf<OptionalsAcceptUndefined<FieldWeightOverrides>>().toEqualTypeOf<true>();
  });

  it('on MergeOptions and its nested objects', () => {
    expectTypeOf<OptionalsAcceptUndefined<MergeOptions>>().toEqualTypeOf<true>();
    expectTypeOf<OptionalsAcceptUndefined<ArrayPolicies>>().toEqualTypeOf<true>();
  });
});

describe('no index signatures', () => {
  it('on any public input type', () => {
    expectTypeOf<HasIndexSignature<PatientLike>>().toEqualTypeOf<false>();
    expectTypeOf<HasIndexSignature<IdentifierLike>>().toEqualTypeOf<false>();
    expectTypeOf<HasIndexSignature<CodeableConceptLike>>().toEqualTypeOf<false>();
    expectTypeOf<HasIndexSignature<CodingLike>>().toEqualTypeOf<false>();
    expectTypeOf<HasIndexSignature<HumanNameLike>>().toEqualTypeOf<false>();
    expectTypeOf<HasIndexSignature<ContactPointLike>>().toEqualTypeOf<false>();
    expectTypeOf<HasIndexSignature<AddressLike>>().toEqualTypeOf<false>();
  });
});

describe('nested code fields are plain strings', () => {
  it('accepts codes outside the FHIR value sets', () => {
    expectTypeOf<{ system: 'pager-from-the-future' }>().toExtend<ContactPointLike>();
    expectTypeOf<{ use: 'nickname-ish' }>().toExtend<HumanNameLike>();
    expectTypeOf<{ type: 'not-a-real-type' }>().toExtend<AddressLike>();
    expectTypeOf<{ use: 'custom' }>().toExtend<IdentifierLike>();
  });
});

describe('sanity checks for the helpers above', () => {
  it('detects a property declared without `| undefined`', () => {
    expectTypeOf<OptionalsAcceptUndefined<{ a?: string; b?: string | undefined }>>().toEqualTypeOf<
      'a' | true
    >();
  });

  it('detects an index signature', () => {
    expectTypeOf<HasIndexSignature<{ [key: string]: unknown }>>().toEqualTypeOf<true>();
  });
});
