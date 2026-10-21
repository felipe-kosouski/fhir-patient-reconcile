// Shared fast-check generators for the matching and merge properties. All values are synthetic.

import fc from 'fast-check';
import {
  type MatchOptions,
  type MergeOptions,
  type MergePath,
  type PatientLike,
  RNDS_CPF_SYSTEM,
} from '../../src/index.js';

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

// --- merge pairs ---
// Random pairs rarely match, so a merge property over them passes without merging anything.
// Both sides start from one shared identity (name, birth date, CPF, phone, email, address).
// Each field then stays shared, gains entries, goes missing, takes another valid value or turns
// into junk, on each side. Most pairs merge (with require: 'possible'); the rest exercise
// refusals. The guard test in merge.property.test.ts checks those rates.

const sharedName = { given: ['João'], family: 'Souza' };
const sharedPhone = { system: 'phone', value: '(41) 99876-5432' };
const sharedEmail = { system: 'email', value: 'joao.souza@example.com' };
const sharedCpf = { system: RNDS_CPF_SYSTEM, value: '111.444.777-35' };

/** Shared (most often), absent, another valid value, or junk. */
const varied = <T>(shared: T, other: fc.Arbitrary<unknown>) =>
  fc.oneof(
    { weight: 4, arbitrary: fc.constant(shared) },
    { weight: 2, arbitrary: fc.constant(undefined) },
    { weight: 2, arbitrary: other },
    { weight: 1, arbitrary: junk },
  );

/** Like `varied` for a list, and often the shared entries plus more, so append-new has work. */
const listed = <T>(shared: readonly T[], entry: fc.Arbitrary<unknown>) => {
  const more = fc.array(entry, { minLength: 1, maxLength: 3 });
  return fc.oneof(
    { weight: 3, arbitrary: fc.constant(shared) },
    { weight: 3, arbitrary: more.map((extra) => [...shared, ...extra]) },
    { weight: 2, arbitrary: fc.constant(undefined) },
    { weight: 2, arbitrary: more },
    { weight: 1, arbitrary: junk },
  );
};

/** Contacts for merge pairs: mostly new numbers and addresses, plus formatting variants. */
const mergeContact = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.record({
      system: fc.constant('phone'),
      value: fc.constantFrom(
        '(41) 98765-4321',
        '(21) 97654-3210',
        '(11) 91234-5678',
        '(41) 99999-9999',
      ),
    }),
  },
  {
    weight: 4,
    arbitrary: fc.record({
      system: fc.constant('email'),
      value: fc.constantFrom(
        'ana@example.com',
        'ANA@example.com',
        'carla@example.com',
        'noemail@example.com',
      ),
    }),
  },
  { weight: 2, arbitrary: contact },
);
const sharedAddress = { line: ['Rua das Flores 100'], postalCode: '80010-000' };
const otherAddress = fc.record(
  {
    line: fc.constantFrom(['Rua A 10'], ['R. das Flores, nº 100'], ['Av. Brasil 2000']),
    postalCode: fc.constantFrom('80010-000', '01310-100', '62701'),
    city: fc.constantFrom('Curitiba', 'Recife'),
  },
  { requiredKeys: [] },
);
const side = fc
  .record({
    name: varied([sharedName], fc.array(humanName, { maxLength: 2 })),
    birthDate: varied('1987-03-14', birthDate),
    telecom: listed([sharedPhone, sharedEmail], mergeContact),
    address: listed([sharedAddress], otherAddress),
    gender: varied('male', fc.constantFrom('female', 'other', 'unknown')),
  })
  .map((fields) => {
    const result: Record<string, unknown> = { resourceType: 'Patient', identifier: [sharedCpf] };
    for (const [key, value] of Object.entries(fields)) if (value !== undefined) result[key] = value;
    // Fresh objects per side: local and incoming must never share an instance, or a merge that
    // compared entries by identity would find "duplicates" by accident.
    return structuredClone(result);
  });

/** Sometimes (1 in `odds`) a value, otherwise absent. */
const sometimes = <T>(value: T, odds = 2) =>
  fc.oneof(
    { weight: 1, arbitrary: fc.constant(value) },
    { weight: odds - 1, arbitrary: fc.constant(undefined) },
  );

/** Elements outside the merge allowlist, on the local side: a merge must never touch them. */
const outsideAllowlist = fc
  .record({
    id: sometimes('local-1'),
    meta: sometimes({ versionId: '3', tag: [{ code: 'reviewed' }] }),
    active: sometimes(true),
    extension: sometimes([{ url: 'urn:example:local', valueString: 'x' }]),
    // Rare: it blocks birthDate, which would otherwise hardly ever be filled.
    _birthDate: sometimes({ extension: [{ url: 'urn:example:data-absent-reason' }] }, 5),
    link: sometimes([{ other: { reference: 'Patient/9' }, type: 'seealso' }]),
  })
  .map((fields) =>
    structuredClone(Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined))),
  );

export const mergePair: fc.Arbitrary<{ local: PatientLike; incoming: PatientLike }> = fc
  .record({ local: side, incoming: side, extra: outsideAllowlist })
  .map(({ local, incoming, extra }) => ({
    local: { ...local, ...extra } as unknown as PatientLike,
    incoming: incoming as unknown as PatientLike,
  }));

const mergePaths: MergePath[] = [
  'birthDate',
  'gender',
  'name',
  'telecom',
  'telecom.phone',
  'telecom.email',
  'address',
];
const arrayPolicy = fc.constantFrom('fill-empty-only', 'append-new' as const);

// Mostly require: 'possible', or most pairs (possible, not match) would be refused.
export const mergeOptions: fc.Arbitrary<MergeOptions> = fc.record(
  {
    require: fc.constantFrom('possible', 'possible', 'possible', 'match', undefined),
    // Mostly none: a random subset protects half the paths and hides every other action.
    protectedPaths: fc.oneof(
      { weight: 3, arbitrary: fc.constant([]) },
      { weight: 1, arbitrary: fc.subarray(mergePaths, { maxLength: 2 }) },
    ),
    arrays: fc.record({ telecom: arrayPolicy, address: arrayPolicy }, { requiredKeys: [] }),
    source: fc.constant('hie:example'),
    includeValues: fc.boolean(),
    matchOptions: fc.constant({ defaultCountry: 'BR' as const }),
  },
  { requiredKeys: ['require'] },
);
