// matchPatients: is this the same person, and why?
// Run after `pnpm build`: node examples/match.mjs (asserts every result the README shows).
import assert from 'node:assert/strict';
import { matchPatients } from 'fhir-patient-reconcile';

// Synthetic data: an invented person, an example.com email, a patterned Brazilian mobile.
const local = {
  resourceType: 'Patient',
  name: [{ family: 'Souza', given: ['João', 'Pedro'] }],
  birthDate: '1987-03-14',
  telecom: [{ system: 'phone', value: '(41) 99876-5432' }],
};

const incoming = {
  resourceType: 'Patient',
  name: [{ family: 'SOUZA', given: ['Joao'] }],
  birthDate: '1987-03-14',
  telecom: [
    { system: 'phone', value: '+55 41 99876 5432' },
    { system: 'email', value: 'joao.souza@example.com' },
  ],
};

const result = matchPatients(local, incoming, { defaultCountry: 'BR' });
assert.equal(result.decision, 'match');
assert.equal(result.matchGrade, 'certain');
assert.equal(result.points, 17);
const row = (field) => {
  const { outcome, points, reason } = result.fields.find((f) => f.field === field);
  return [outcome, points, reason];
};
assert.deepEqual(row('family'), ['exact', 4, 'every family name on one side appears on the other']);
assert.deepEqual(row('given'), ['exact', 4, 'first given names are equal']);
assert.deepEqual(row('middle'), ['missing', 0, 'no middle name on one or both sides']);
assert.deepEqual(row('birthDate'), ['exact', 5, 'birth dates are equal']);
assert.deepEqual(row('phone'), ['exact', 4, 'a phone number is shared']);
assert.deepEqual(row('email'), ['missing', 0, 'no usable email address on one or both sides']);
// No patient values in the explanation unless includeValues: true.
assert.doesNotMatch(JSON.stringify(result), /joao|souza|9876|1987/i);

// A twin sister: same family, birth date and phone, different first name.
const twin = { ...incoming, name: [{ family: 'Souza', given: ['Joana'] }] };
const twinResult = matchPatients(local, twin, { defaultCountry: 'BR' });
assert.equal(twinResult.decision, 'possible');
assert.equal(twinResult.points, 10);

// Father (Filho) and grandson (Neto) with the same first name: vetoed.
const grandson = {
  ...local,
  name: [{ family: 'Souza Neto', given: ['João'] }],
  birthDate: '2010-05-02',
};
const father = { ...local, name: [{ family: 'Souza Filho', given: ['João'] }] };
const vetoed = matchPatients(father, grandson);
assert.deepEqual(
  vetoed.vetoes.map((v) => v.code),
  ['generational-suffix-conflict', 'birthdate-conflict'],
);
assert.equal(vetoed.decision, 'no-match');
assert.equal(vetoed.matchGrade, 'certainly-not');

console.log('examples/match.mjs OK');
