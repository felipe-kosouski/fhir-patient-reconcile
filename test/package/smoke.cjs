// Requires the built package by name (self-reference through "exports"),
// so this exercises the published CJS entry, not the source.
const assert = require('node:assert/strict');
const { PACKAGE_NAME } = require('fhir-patient-reconcile');

assert.equal(PACKAGE_NAME, 'fhir-patient-reconcile');
console.log('CJS require OK');
