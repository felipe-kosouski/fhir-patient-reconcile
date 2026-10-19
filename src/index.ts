// Public API entry point. Only re-exports belong here.

export {
  type GenerationalSuffix,
  type NormalizedName,
  normalizeName,
  normalizeText,
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
