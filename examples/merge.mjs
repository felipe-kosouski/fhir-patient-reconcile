// mergePatient: what can safely be taken from the incoming record?
// Run after `pnpm build`: node examples/merge.mjs (asserts every result the README shows).
import assert from 'node:assert/strict';
import { mergePatient } from 'fhir-patient-reconcile';

// Synthetic data: the same pair as examples/match.mjs.
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
const matchOptions = { defaultCountry: 'BR' };

// The local record has no email: it is filled. Everything else is kept.
const merged = mergePatient(local, incoming, { matchOptions, source: 'hie:example' });
assert.equal(merged.status, 'merged');
assert.deepEqual(merged.changes, [
  { path: 'birthDate', action: 'skipped-duplicate', origin: 'local' },
  { path: 'name', action: 'kept-local', origin: 'local' },
  { path: 'telecom[system=phone]', action: 'skipped-duplicate', origin: 'local' },
  { path: 'telecom[system=email]', action: 'filled', origin: 'incoming', source: 'hie:example' },
]);
assert.deepEqual(merged.patient.telecom, [
  { system: 'phone', value: '(41) 99876-5432' },
  { system: 'email', value: 'joao.souza@example.com' },
]);
assert.notEqual(merged.patient, local); // inputs are never mutated

// A twin sister is only 'possible': refused, with an unchanged copy of local.
const twin = { ...incoming, name: [{ family: 'Souza', given: ['Joana'] }] };
const refused = mergePatient(local, twin, { matchOptions });
assert.equal(refused.status, 'refused');
assert.deepEqual(refused.patient, local);
assert.deepEqual(refused.changes, []);

// A path a person confirmed is never written.
const guarded = mergePatient(local, incoming, { matchOptions, protectedPaths: ['telecom'] });
assert.deepEqual(guarded.changes.at(-1), {
  path: 'telecom[system=email]',
  action: 'skipped-protected',
  origin: 'local',
});

// Opt in to also add new phones, emails and addresses when local already has some.
const newPhone = {
  ...incoming,
  telecom: [...incoming.telecom, { system: 'phone', value: '(41) 98765-4321' }],
};
const appended = mergePatient(local, newPhone, { matchOptions, arrays: { telecom: 'append-new' } });
assert.deepEqual(
  appended.changes.find((c) => c.path === 'telecom[system=phone]'),
  {
    path: 'telecom[system=phone]',
    action: 'appended',
    origin: 'incoming',
    appended: 1,
    duplicates: 1,
  },
);
assert.deepEqual(
  appended.patient.telecom.map((c) => c.value),
  ['(41) 99876-5432', '(41) 98765-4321', 'joao.souza@example.com'],
);

console.log('examples/merge.mjs OK');
