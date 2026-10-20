// Public API entry point. Only re-exports belong here.

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
