// Requires the built package by name (self-reference through "exports"),
// so this exercises the published CJS entry, not the source.
const assert = require('node:assert/strict');
const { jaroWinkler, normalizeName, normalizeText } = require('fhir-patient-reconcile');

assert.equal(normalizeText('João'), 'joao');
assert.equal(normalizeName({ given: ['Ana'], family: 'Souza' })?.given, 'ana');
assert.equal(jaroWinkler('foo', 'foo'), 1);
console.log('CJS require OK');
