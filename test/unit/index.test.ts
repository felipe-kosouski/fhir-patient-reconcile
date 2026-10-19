import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME } from '../../src/index.js';

describe('package entry point', () => {
  it('exports the package name', () => {
    expect(PACKAGE_NAME).toBe('fhir-patient-reconcile');
  });
});
