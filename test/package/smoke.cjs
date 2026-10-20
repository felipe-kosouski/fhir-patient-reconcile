// Requires the built package by name (self-reference through "exports"),
// so this exercises the published CJS entry, not the source.
const assert = require('node:assert/strict');
const {
  DEFAULT_THRESHOLDS,
  jaroWinkler,
  mergePatient,
  normalizeName,
  normalizeText,
} = require('fhir-patient-reconcile');

assert.equal(normalizeText('João'), 'joao');
assert.equal(normalizeName({ given: ['Ana'], family: 'Souza' })?.given, 'ana');
assert.equal(jaroWinkler('foo', 'foo'), 1);
assert.deepEqual(DEFAULT_THRESHOLDS, { match: 14, possible: 8 });
assert.equal(
  mergePatient({ resourceType: 'Patient' }, { resourceType: 'Patient' }).status,
  'refused',
);
console.log('CJS require OK');
