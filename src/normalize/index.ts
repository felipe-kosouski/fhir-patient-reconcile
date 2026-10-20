export {
  type AddressCountry,
  type NormalizedAddress,
  normalizeAddress,
} from './address.js';
export { normalizeCpf, RNDS_CPF_SYSTEM } from './cpf.js';
export { type BirthDatePrecision, type NormalizedBirthDate, normalizeBirthDate } from './date.js';
export { normalizeEmail } from './email.js';
export { type GenerationalSuffix, type NormalizedName, normalizeName } from './name.js';
export {
  type NormalizedPhone,
  type NormalizePhoneOptions,
  normalizePhone,
  type PhoneCountry,
} from './phone.js';
export { normalizeText } from './text.js';
