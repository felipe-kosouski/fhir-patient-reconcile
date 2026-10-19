// Imports the built package by name (self-reference through "exports"),
// so this exercises the published ESM entry, not the source.
import assert from 'node:assert/strict';
import { normalizeName, normalizeText } from 'fhir-patient-reconcile';

assert.equal(normalizeText('João'), 'joao');
assert.equal(normalizeName({ given: ['Ana'], family: 'Souza' })?.given, 'ana');
console.log('ESM import OK');
