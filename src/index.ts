// Public API entry point. Only re-exports belong here.

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

// Placeholder runtime export so the build and ESM/CJS smoke tests have a value to load.
// Removed in session 3, when the first normalizer is exported.
/** The package name. */
export const PACKAGE_NAME = 'fhir-patient-reconcile' as const;
