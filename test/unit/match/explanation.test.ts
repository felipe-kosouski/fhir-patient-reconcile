// Snapshots of a full explanation, so a reviewer can read exactly what leaves the library: the
// default result (no patient values) next to the same result with `includeValues: true`.
// Regenerate with `pnpm vitest run test/unit/match/explanation.test.ts -u` and review the diff.

import { describe, expect, it } from 'vitest';
import { matchPatients, type PatientLike, RNDS_CPF_SYSTEM } from '../../../src/index.js';

// Synthetic: invented names, example.com email, patterned Brazilian numbers, check-digit CPF.
const local: PatientLike = {
  resourceType: 'Patient',
  identifier: [{ system: RNDS_CPF_SYSTEM, value: '111.444.777-35' }],
  name: [{ given: ['João', 'Pedro'], family: 'da Silva Souza' }],
  gender: 'male',
  birthDate: '1987-03-04',
  telecom: [
    { system: 'phone', value: '(41) 99876-5432' },
    { system: 'email', value: 'joao.souza@example.com' },
  ],
  address: [{ line: ['R. das Flores, nº 100'], city: 'Curitiba', postalCode: '80010-000' }],
};

const incoming: PatientLike = {
  resourceType: 'Patient',
  identifier: [{ system: RNDS_CPF_SYSTEM, value: '11144477735' }],
  name: [{ given: ['JOAO', 'P.'], family: 'Souza' }],
  gender: 'male',
  birthDate: '1987-04-03',
  telecom: [
    { system: 'phone', value: '+55 41 99876 5432' },
    { system: 'email', value: 'jp.souza@example.com' },
  ],
  address: [{ line: ['Rua das Flores 102'], postalCode: '80010000' }],
};

/** Every value of the input, as written and as normalized. None may appear by default. */
const INPUT_VALUES = [
  'joão',
  'joao',
  'pedro',
  'silva',
  'souza',
  '1987',
  '9876',
  '99876',
  '5432',
  '111.444',
  '11144477735',
  'example.com',
  'flores',
  'curitiba',
  '80010',
];

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

describe('explanation snapshots', () => {
  it('by default: outcomes, points and reasons only, no patient values', async () => {
    const result = matchPatients(local, incoming, { defaultCountry: 'BR' });
    const text = json(result);
    for (const value of INPUT_VALUES) expect(text.toLowerCase()).not.toContain(value);
    await expect(text).toMatchFileSnapshot('__snapshots__/explanation.json');
  });

  it('with includeValues: the normalized values are added, nothing else changes', async () => {
    const plain = matchPatients(local, incoming, { defaultCountry: 'BR' });
    const result = matchPatients(local, incoming, { defaultCountry: 'BR', includeValues: true });
    const stripped = result.fields.map(({ local: _l, incoming: _i, ...rest }) => rest);
    expect({ ...result, fields: stripped }).toEqual(plain);
    await expect(json(result)).toMatchFileSnapshot('__snapshots__/explanation-with-values.json');
  });
});
