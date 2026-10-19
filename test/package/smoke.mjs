// Imports the built package by name (self-reference through "exports"),
// so this exercises the published ESM entry, not the source.
import assert from 'node:assert/strict';
import { PACKAGE_NAME } from 'fhir-patient-reconcile';

assert.equal(PACKAGE_NAME, 'fhir-patient-reconcile');
console.log('ESM import OK');
