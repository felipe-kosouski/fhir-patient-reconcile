// Requires the built package by name (self-reference through "exports"),
// so this exercises the published CJS entry, not the source.
const assert = require('node:assert/strict');
const { normalizeName, normalizeText } = require('fhir-patient-reconcile');

assert.equal(normalizeText('João'), 'joao');
assert.equal(normalizeName({ given: ['Ana'], family: 'Souza' })?.given, 'ana');
console.log('CJS require OK');
