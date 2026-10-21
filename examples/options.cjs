// Configuring matchPatients, loaded through require() (the CommonJS build).
// Run after `pnpm build`: node examples/options.cjs (asserts every result the README shows).
const assert = require('node:assert/strict');
const { matchPatients, mergePatient, RNDS_CPF_SYSTEM } = require('fhir-patient-reconcile');

// Synthetic data: a clinic's own record number and a UK number from Ofcom's drama range.
const mrn = 'urn:example:clinic-a:mrn';
const local = {
  resourceType: 'Patient',
  identifier: [{ system: mrn, value: 'A-1001' }],
  name: [{ family: 'Smith', given: ['Ann'] }],
  birthDate: '1990-07-01',
  telecom: [{ system: 'phone', value: '+44 20 7946 0123' }],
};
const incoming = {
  ...local,
  name: [{ family: 'SMITH', given: ['Ann'] }],
  telecom: [{ system: 'phone', value: '020 7946 0123' }],
};

// Out of the box: the record number's system is not trusted and UK phones are not understood,
// so only the name and birth date count.
const plain = matchPatients(local, incoming);
assert.equal(plain.decision, 'possible');
assert.equal(plain.points, 13);

// A toy UK normalizer: the hook returns E.164, or undefined when the value is unusable.
const ukPhone = (value) => {
  const digits = value.replace(/\D/g, '');
  const national = digits.startsWith('44') ? digits.slice(2) : digits.replace(/^0/, '');
  return national.length === 10 ? `+44${national}` : undefined;
};
const options = {
  identifierSystems: { trusted: [RNDS_CPF_SYSTEM, mrn] }, // replaces the default list
  normalizePhone: ukPhone, // replaces the built-in Brazil + NANP parser
  includeValues: true, // adds local/incoming values to each field: keep out of logs
};
const configured = matchPatients(local, incoming, options);
assert.equal(configured.decision, 'match');
assert.equal(configured.points, 27);
const phone = configured.fields.find((f) => f.field === 'phone');
assert.deepEqual(phone, {
  field: 'phone',
  outcome: 'exact',
  points: 4,
  reason: 'a phone number is shared',
  local: '+442079460123',
  incoming: '+442079460123',
});

// Stricter thresholds turn the same pair into a review case.
const strict = matchPatients(local, incoming, { ...options, thresholds: { match: 30 } });
assert.equal(strict.decision, 'possible');
assert.equal(strict.matchGrade, 'probable');

// mergePatient takes the same options as matchOptions. Its own report has no values unless
// includeValues is passed to mergePatient itself.
const merged = mergePatient(local, { ...incoming, gender: 'female' }, { matchOptions: options });
assert.equal(merged.status, 'merged');
assert.equal(merged.patient.gender, 'female');
assert.deepEqual(
  merged.changes.find((c) => c.path === 'gender'),
  {
    path: 'gender',
    action: 'filled',
    origin: 'incoming',
  },
);

console.log('examples/options.cjs OK');
