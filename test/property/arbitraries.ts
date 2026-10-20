// Shared fast-check generators for the matching properties. All values are synthetic.

import fc from 'fast-check';
import { type MatchOptions, type PatientLike, RNDS_CPF_SYSTEM } from '../../src/index.js';

// Small pools of synthetic values, so equal, near and different values all come up often.
const given = fc.constantFrom(
  'João',
  'Joao',
  'Ana',
  'Gabriela',
  'Grabiela',
  'Lucas',
  'RN de Maria',
  'J.',
);
const family = fc.constantFrom(
  'Souza',
  'da Silva Souza',
  'Silva',
  'Oliveira',
  'Olivera',
  'Souza Filho',
  'Souza Neto',
);
const humanName = fc.oneof(
  fc.record(
    {
      given: fc.array(given, { maxLength: 3 }),
      family,
      suffix: fc.constantFrom(['Jr.'], ['Sr.'], ['Júnior'], ['Filho'], ['Neto']),
    },
    { requiredKeys: ['given'] },
  ),
  fc.record({ text: fc.constantFrom('João Pedro Souza', 'Ana Silva Souza', 'Maria') }),
);
const birthDate = fc.constantFrom(
  '1987-03-14',
  '1987-03-04',
  '1987-04-03',
  '1987-03-13',
  '1981-03-14',
  '1987',
  '1987-03',
  '1962-08-19',
  '1900-01-01',
);
const contact = fc.oneof(
  fc.record({
    system: fc.constantFrom('phone', 'sms', 'fax'),
    value: fc.constantFrom(
      '(41) 99876-5432',
      '+55 41 99876 5432',
      '(41) 9876-5432',
      '(21) 97654-3210',
      '(41) 99999-9999',
    ),
  }),
  fc.record({
    system: fc.constant('email'),
    value: fc.constantFrom(
      'ana@example.com',
      'ANA@example.com',
      'carla@example.com',
      'noemail@example.com',
    ),
  }),
);
const identifier = fc.record({
  system: fc.constantFrom(RNDS_CPF_SYSTEM, 'urn:example:clinic-a:mrn'),
  value: fc.constantFrom(
    '111.444.777-35',
    '11144477735',
    '333.444.555-08',
    '000.000.000-00',
    'A-1',
  ),
});
const address = fc.record(
  {
    line: fc.constantFrom(['Rua das Flores 100'], ['R. das Flores, nº 100'], ['Rua A 10']),
    postalCode: fc.constantFrom('80010-000', '01310-100', '62701'),
    city: fc.constant('Curitiba'),
  },
  { requiredKeys: [] },
);
export const patient: fc.Arbitrary<PatientLike> = fc
  .record(
    {
      name: fc.array(humanName, { maxLength: 3 }),
      birthDate,
      telecom: fc.array(contact, { maxLength: 3 }),
      identifier: fc.array(identifier, { maxLength: 2 }),
      address: fc.array(address, { maxLength: 2 }),
      gender: fc.constantFrom('male', 'female', 'unknown'),
    },
    { requiredKeys: [] },
  )
  .map((fields) => ({ resourceType: 'Patient', ...fields }) as PatientLike);
export const options: fc.Arbitrary<MatchOptions> = fc.record(
  {
    defaultCountry: fc.constantFrom('BR', 'US'),
    identifierSystems: fc.constant({ trusted: [RNDS_CPF_SYSTEM, 'urn:example:clinic-a:mrn'] }),
  },
  { requiredKeys: [] },
);

// Untrusted JSON: any field may hold null, a number, an object or an array where a string is
// expected; null is even legal inside arrays of primitives in FHIR JSON.
const junk = fc.jsonValue({ maxDepth: 2 });
const loose = <T>(valid: fc.Arbitrary<T>) => fc.oneof(valid, junk);
const looseList = <T>(item: fc.Arbitrary<T>) =>
  loose(fc.array(fc.oneof(item, junk), { maxLength: 3 }));
const looseName = fc.record(
  {
    given: looseList(given),
    family: loose(family),
    text: loose(fc.constant('João Pedro Souza')),
    suffix: looseList(fc.constantFrom('Jr.', 'Filho')),
  },
  { requiredKeys: [] },
);
const looseContact = fc.record(
  {
    system: loose(fc.constantFrom('phone', 'email')),
    value: loose(fc.constant('(41) 99876-5432')),
  },
  { requiredKeys: [] },
);
const looseAddress = fc.record(
  {
    line: looseList(fc.constant('Rua das Flores 100')),
    city: junk,
    postalCode: loose(fc.constant('80010-000')),
    country: junk,
  },
  { requiredKeys: [] },
);
export const untrusted: fc.Arbitrary<PatientLike> = fc
  .record(
    {
      name: looseList(looseName),
      telecom: looseList(looseContact),
      address: looseList(looseAddress),
      identifier: looseList(
        fc.record(
          { system: loose(fc.constant(RNDS_CPF_SYSTEM)), value: junk },
          { requiredKeys: [] },
        ),
      ),
      birthDate: loose(birthDate),
      gender: junk,
    },
    { requiredKeys: [] },
  )
  .map((fields) => ({ resourceType: 'Patient', ...fields }) as unknown as PatientLike);
