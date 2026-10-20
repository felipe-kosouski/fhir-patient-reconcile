// Compatibility with third-party FHIR typings. The external packages are the oracle:
// if their Patient stops being assignable to PatientLike, consumers would need casts.
// Runs under exactOptionalPropertyTypes true (tsconfig.json) and false (tsconfig.loose.json).
import type { Patient as MedplumPatient } from '@medplum/fhirtypes';
import type { Patient as R4Patient } from 'fhir/r4.js';
import type { Patient as R5Patient } from 'fhir/r5.js';
import { describe, expectTypeOf, it } from 'vitest';
import { matchPatients, mergePatient, type PatientLike } from '../../src/index.js';

/** The patient a merge returns, with the caller's own type. */
const keepsType = <P extends PatientLike>(local: P, incoming: PatientLike): P =>
  mergePatient(local, incoming).patient;

describe('PatientLike accepts third-party Patient types without casts', () => {
  it('@types/fhir R4', () => {
    expectTypeOf<R4Patient>().toExtend<PatientLike>();
  });

  it('@types/fhir R5', () => {
    expectTypeOf<R5Patient>().toExtend<PatientLike>();
  });

  it('@medplum/fhirtypes', () => {
    expectTypeOf<MedplumPatient>().toExtend<PatientLike>();
  });

  it('matchPatients mixes packages in one call', () => {
    expectTypeOf(matchPatients).toBeCallableWith({} as R4Patient, {} as MedplumPatient);
    expectTypeOf(matchPatients).toBeCallableWith({} as MedplumPatient, {} as R5Patient);
    expectTypeOf(matchPatients).toBeCallableWith({} as R4Patient, {} as R4Patient, {
      defaultCountry: 'BR',
    });
  });
});

describe('mergePatient returns the caller type', () => {
  it('keeps R4, R5 and Medplum types', () => {
    expectTypeOf(
      mergePatient({} as R4Patient, {} as MedplumPatient).patient,
    ).toEqualTypeOf<R4Patient>();
    expectTypeOf(keepsType({} as R4Patient, {} as MedplumPatient)).toEqualTypeOf<R4Patient>();
    expectTypeOf(keepsType({} as R5Patient, {} as R4Patient)).toEqualTypeOf<R5Patient>();
    expectTypeOf(keepsType({} as MedplumPatient, {} as R4Patient)).toEqualTypeOf<MedplumPatient>();
  });
});

describe('object literals', () => {
  it('accepts an inline literal at the call site', () => {
    matchPatients({ resourceType: 'Patient', name: [{ family: 'Souza', given: ['Joao'] }] }, {
      resourceType: 'Patient',
    } as R4Patient);
  });

  it('accepts an `as const` literal (readonly arrays, literal codes)', () => {
    const local = {
      resourceType: 'Patient',
      name: [{ family: 'Souza', given: ['João', 'Pedro'] }],
      birthDate: '1987-03-14',
      telecom: [{ system: 'phone', value: '(41) 99876-5432' }],
    } as const;
    expectTypeOf(local).toExtend<PatientLike>();
    expectTypeOf(keepsType(local, local)).toEqualTypeOf(local);
  });

  it('accepts explicit undefined on optional properties', () => {
    const patient: PatientLike = {
      resourceType: 'Patient',
      id: undefined,
      name: [{ family: undefined, given: undefined }],
      gender: undefined,
    };
    expectTypeOf(patient).toExtend<PatientLike>();
  });

  it('rejects an unannotated, non-const variable (resourceType widens to string)', () => {
    // Documented behavior, not a bug: TypeScript widens `resourceType` to `string` in a plain
    // `const` object. Callers use `as const`, `satisfies PatientLike` or a type annotation.
    const widened = { resourceType: 'Patient', birthDate: '1987-03-14' };
    // @ts-expect-error resourceType is string, not 'Patient'
    matchPatients(widened, widened);

    const satisfied = { resourceType: 'Patient', birthDate: '1987-03-14' } satisfies PatientLike;
    matchPatients(satisfied, satisfied);
  });
});

describe('rejections', () => {
  it('rejects other resource types', () => {
    // @ts-expect-error not a Patient
    matchPatients({ resourceType: 'Observation' }, { resourceType: 'Patient' });
  });

  it('rejects a missing resourceType', () => {
    // @ts-expect-error resourceType is required
    matchPatients({ birthDate: '1987-03-14' }, { resourceType: 'Patient' });
  });

  it('rejects an invalid gender code', () => {
    // @ts-expect-error gender is a closed FHIR value set
    matchPatients({ resourceType: 'Patient', gender: 'M' }, { resourceType: 'Patient' });
  });
});
