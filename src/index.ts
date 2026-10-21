// Public API entry point. Only re-exports belong here.

export {
  DEFAULT_THRESHOLDS,
  DEFAULT_WEIGHTS,
  type FhirMatchGrade,
  type FieldOutcome,
  type FieldResult,
  type FieldWeightOverrides,
  type FieldWeights,
  type MatchDecision,
  type MatchField,
  type MatchOptions,
  type MatchResult,
  type MatchThresholds,
  matchPatients,
  type Veto,
} from './match/index.js';
export {
  type ArrayPolicies,
  type ArrayPolicy,
  type Change,
  type ChangeAction,
  type MergeOptions,
  type MergePath,
  type MergePolicy,
  type MergeResult,
  mergePatient,
} from './merge/index.js';
export {
  type AddressCountry,
  type BirthDatePrecision,
  type GenerationalSuffix,
  type NormalizedAddress,
  type NormalizedBirthDate,
  type NormalizedName,
  type NormalizedPhone,
  type NormalizePhoneOptions,
  normalizeAddress,
  normalizeBirthDate,
  normalizeCpf,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeText,
  type PhoneCountry,
  RNDS_CPF_SYSTEM,
} from './normalize/index.js';
export { damerauLevenshtein, jaroWinkler } from './similarity/index.js';
export type {
  AddressLike,
  AdministrativeGender,
  CodeableConceptLike,
  CodingLike,
  ContactPointLike,
  HumanNameLike,
  IdentifierLike,
  PatientLike,
} from './types/fhir.js';
