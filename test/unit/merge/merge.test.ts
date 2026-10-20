import { describe, expect, it } from 'vitest';
import {
  type Change,
  type MergeOptions,
  matchPatients,
  mergePatient,
  type PatientLike,
  RNDS_CPF_SYSTEM,
} from '../../../src/index.js';

// Synthetic data only: invented names, example.com emails, patterned Brazilian numbers and a
// CPF built with the check-digit rule.

type Fields = Omit<PatientLike, 'resourceType'>;
const patient = (fields: Fields): PatientLike => ({ resourceType: 'Patient', ...fields });
const cpf = { system: RNDS_CPF_SYSTEM, value: '111.444.777-35' };
const phone = (value: string) => ({ system: 'phone', value });
const email = (value: string) => ({ system: 'email', value });

// The plan's example: the same person, recorded twice.
const local = patient({
  name: [{ family: 'Souza', given: ['João', 'Pedro'] }],
  birthDate: '1987-03-14',
  telecom: [phone('(41) 99876-5432')],
});
const incoming = patient({
  name: [{ family: 'SOUZA', given: ['Joao'] }],
  birthDate: '1987-03-14',
  telecom: [phone('+55 41 99876 5432'), email('Joao.Souza@example.com')],
});

/** A pair that is `possible` (no name on the local side), to reach the name path. */
const nameless = patient({
  identifier: [cpf],
  birthDate: '1987-03-14',
  telecom: [phone('(41) 99876-5432'), email('joao@example.com')],
});

const change = (changes: readonly Change[], path: string) => changes.find((c) => c.path === path);

describe('mergePatient: the plan example', () => {
  it('fills the missing email, keeps the local name and skips the duplicate phone', () => {
    const result = mergePatient(local, incoming, { source: 'hie:example' });
    expect(result.status).toBe('merged');
    expect(result.changes).toEqual([
      { path: 'birthDate', action: 'skipped-duplicate', origin: 'local' },
      { path: 'name', action: 'kept-local', origin: 'local' },
      { path: 'telecom[system=phone]', action: 'skipped-duplicate', origin: 'local' },
      {
        path: 'telecom[system=email]',
        action: 'filled',
        origin: 'incoming',
        source: 'hie:example',
      },
    ]);
    expect(result.patient.telecom).toEqual([
      phone('(41) 99876-5432'),
      email('Joao.Souza@example.com'),
    ]);
    expect(result.patient.name).toEqual(local.name);
  });

  it('refuses a twin: a different first name is not a match', () => {
    const twin = { ...incoming, name: [{ family: 'Souza', given: ['Joana'] }] };
    expect(mergePatient(local, twin).status).toBe('refused');
  });
});

describe('mergePatient: when it refuses', () => {
  it('no-match: refused, with an unchanged copy of the local patient', () => {
    const stranger = patient({ name: [{ given: ['Carla'], family: 'Pereira' }] });
    const result = mergePatient(local, stranger);
    expect(result).toMatchObject({
      status: 'refused',
      changes: [],
      reason: 'the patients do not match',
    });
    expect(result.patient).toEqual(local);
    expect(result.patient).not.toBe(local);
  });

  it('possible: refused unless require is possible', () => {
    const r1 = mergePatient(nameless, incoming);
    expect(r1.status).toBe('refused');
    expect(r1.status === 'refused' && r1.reason).toContain("require: 'possible'");
    expect(mergePatient(nameless, incoming, { require: 'possible' }).status).toBe('merged');
  });

  it('a veto refuses even with require possible (an equal CPF lifted it to possible)', () => {
    const a = patient({ identifier: [cpf], name: [{ given: ['José'], family: 'Souza Filho' }] });
    const b = patient({ identifier: [cpf], name: [{ given: ['José'], family: 'Souza Neto' }] });
    expect(matchPatients(a, b).decision).toBe('possible');
    const result = mergePatient(a, b, { require: 'possible' });
    expect(result.status).toBe('refused');
    expect(result.status === 'refused' && result.reason).toContain('generational-suffix-conflict');
  });

  it('a match passed in is verified: a result for other patients refuses', () => {
    const forged = matchPatients(local, local); // a perfect match, but for another pair
    const stranger = patient({ name: [{ given: ['Carla'], family: 'Pereira' }] });
    const result = mergePatient(local, stranger, { match: forged });
    expect(result.status).toBe('refused');
    expect(result.status === 'refused' && result.reason).toContain(
      'not computed for these patients',
    );
    expect(result.match.decision).toBe('no-match'); // the merge's own run is reported
  });

  it('a match computed with other options refuses unless the same options are passed', () => {
    const matchOptions = { thresholds: { match: 16 } };
    const match = matchPatients(local, incoming, matchOptions);
    expect(mergePatient(local, incoming, { match }).status).toBe('refused');
    expect(mergePatient(local, incoming, { match, matchOptions }).status).toBe('merged');
  });

  it('the right match passed in is accepted', () => {
    const match = matchPatients(local, incoming);
    expect(mergePatient(local, incoming, { match }).status).toBe('merged');
  });
});

describe('mergePatient: fill-empty-only', () => {
  const base: Fields = {
    name: [{ given: ['João'], family: 'Souza' }],
    telecom: [phone('(41) 99876-5432')],
  };
  /** Merges with require: 'possible' and fails the test if the merge was refused. */
  const merge = (l: Fields, i: Fields, options: MergeOptions = {}) => {
    const result = mergePatient(patient({ ...base, ...l }), patient({ ...base, ...i }), {
      require: 'possible',
      ...options,
    });
    expect(result.status, result.status === 'refused' ? result.reason : '').toBe('merged');
    return result;
  };

  it.each<[string, Fields, Fields, Change['action'] | undefined]>([
    ['local has none: filled', {}, { birthDate: '1987-03-14' }, 'filled'],
    [
      'same date: duplicate',
      { birthDate: '1987-03-14' },
      { birthDate: ' 1987-03-14 ' },
      'skipped-duplicate',
    ],
    [
      'a date-time is not a FHIR date: invalid',
      {},
      { birthDate: '1987-03-14T10:00:00Z' },
      'skipped-invalid',
    ],
    ['a placeholder is invalid', {}, { birthDate: '1900-01-01' }, 'skipped-invalid'],
    [
      'a local partial date is data: kept',
      { birthDate: '1987' },
      { birthDate: '1987-03-14' },
      'kept-local',
    ],
    ['incoming has none: nothing to report', { birthDate: '1987-03-14' }, {}, undefined],
  ])('birthDate, %s', (_, l, i, action) => {
    expect(change(merge(l, i).changes, 'birthDate')?.action).toBe(action);
  });

  it('a local _birthDate (data-absent-reason) means "deliberately absent": never filled', () => {
    const l = {
      ...patient(base),
      _birthDate: {
        extension: [
          {
            url: 'http://hl7.org/fhir/StructureDefinition/data-absent-reason',
            valueCode: 'asked-declined',
          },
        ],
      },
    };
    const result = mergePatient(l, patient({ ...base, birthDate: '1987-03-14' }), {
      require: 'possible',
    });
    expect(change(result.changes, 'birthDate')?.action).toBe('kept-local');
    expect(result.patient.birthDate).toBeUndefined();
  });

  it('gender: filled from a real code, unknown is not information', () => {
    expect(merge({}, { gender: 'female' }).patient.gender).toBe('female');
    expect(change(merge({}, { gender: 'unknown' }).changes, 'gender')?.action).toBe(
      'skipped-invalid',
    );
    expect(
      change(merge({ gender: 'unknown' }, { gender: 'female' }).changes, 'gender')?.action,
    ).toBe('kept-local');
  });

  it('name: copied only when local has none, valid entries only, known fields only', () => {
    const named = patient({
      ...nameless,
      name: [
        { given: ['RN de Maria'], family: 'Souza' },
        {
          use: 'official',
          given: ['João', null as unknown as string],
          family: 'Souza',
          extension: [{ url: 'urn:example:x' }],
        } as never,
      ],
    });
    const result = mergePatient(nameless, named, { require: 'possible' });
    expect(change(result.changes, 'name')?.action).toBe('filled');
    expect(result.patient.name).toEqual([{ use: 'official', family: 'Souza', given: ['João'] }]);
  });

  it('telecom: per system; other systems are never touched', () => {
    const result = merge(
      // The same birth date keeps the pair at possible although the phones differ.
      {
        birthDate: '1987-03-14',
        telecom: [phone('(41) 99876-5432'), { system: 'fax', value: '(41) 3333-4444' }],
      },
      {
        birthDate: '1987-03-14',
        telecom: [
          phone('(41) 98765-4321'),
          email('a@example.com'),
          email('A@EXAMPLE.COM'),
          email('noemail@example.com'),
          { system: 'fax', value: '(41) 5555-6666' },
        ],
      },
    );
    expect(change(result.changes, 'telecom[system=phone]')?.action).toBe('kept-local');
    expect(change(result.changes, 'telecom[system=email]')?.action).toBe('filled');
    expect(result.patient.telecom).toEqual([
      phone('(41) 99876-5432'),
      { system: 'fax', value: '(41) 3333-4444' },
      email('a@example.com'), // one copy: the second normalizes to the same address
    ]);
  });

  it('telecom: only invalid incoming values is skipped-invalid', () => {
    const result = merge({}, { telecom: [...(base.telecom ?? []), email('not-an-email')] });
    expect(change(result.changes, 'telecom[system=email]')?.action).toBe('skipped-invalid');
  });

  it('address: filled when local has none, kept otherwise', () => {
    const address = {
      line: ['R. das Flores, nº 100'],
      postalCode: '80010-000',
      extension: [],
    } as never;
    const filled = merge({}, { address: [address] });
    expect(filled.patient.address).toEqual([
      { line: ['R. das Flores, nº 100'], postalCode: '80010-000' },
    ]);
    const kept = merge(
      { address: [{ line: ['Rua A 10'], postalCode: '01310-100' }] },
      { address: [address] },
    );
    expect(change(kept.changes, 'address')?.action).toBe('kept-local');
    const same = merge(
      { address: [{ line: ['Rua das Flores 100'], postalCode: '80010000' }] },
      { address: [address] },
    );
    expect(change(same.changes, 'address')?.action).toBe('skipped-duplicate');
  });
});

describe('mergePatient: protected paths', () => {
  it.each<[MergeOptions['protectedPaths'], string, Change['action']]>([
    [['telecom'], 'telecom[system=email]', 'skipped-protected'],
    [['telecom.email'], 'telecom[system=email]', 'skipped-protected'],
    [['telecom.phone'], 'telecom[system=email]', 'filled'],
    [['telecom.phone'], 'telecom[system=phone]', 'skipped-protected'],
  ])('%j: %s is %s', (protectedPaths, path, action) => {
    const result = mergePatient(local, incoming, { protectedPaths });
    expect(change(result.changes, path)?.action).toBe(action);
  });

  it('a protected path is never written, even when the local record is empty there', () => {
    const result = mergePatient(local, incoming, { protectedPaths: ['telecom'] });
    expect(result.patient.telecom).toEqual(local.telecom);
  });
});

describe('mergePatient: the allowlist', () => {
  it('touches nothing outside it, on either record', () => {
    const l = {
      ...local,
      id: 'local-1',
      meta: { versionId: '3' },
      active: true,
      extension: [{ url: 'urn:example:local' }],
    };
    const i = {
      ...incoming,
      id: 'incoming-9',
      meta: { versionId: '1' },
      active: false,
      deceasedBoolean: true,
      extension: [{ url: 'urn:example:incoming' }],
      identifier: [cpf],
      link: [{ other: { reference: 'Patient/2' }, type: 'seealso' }],
    };
    const result = mergePatient(l, i);
    expect(result.status).toBe('merged');
    const { telecom: _t, ...rest } = result.patient;
    const { telecom: _lt, ...localRest } = l;
    expect(rest).toEqual(localRest);
  });

  it('never writes to its inputs: deep-frozen records merge fine', () => {
    const freeze = <T>(value: T): T => {
      if (typeof value === 'object' && value !== null) {
        for (const child of Object.values(value)) freeze(child);
        Object.freeze(value);
      }
      return value;
    };
    const l = freeze(structuredClone(local));
    const i = freeze(structuredClone(incoming));
    const result = mergePatient(l, i, { includeValues: true });
    expect(result.status).toBe('merged');
    expect([l, i]).toEqual([local, incoming]);
  });

  it('keeps the caller type and shares no object with the inputs', () => {
    const result = mergePatient(local, incoming);
    expect(result.patient).not.toBe(local);
    expect(result.patient.telecom?.[1]).not.toBe(incoming.telecom?.[1]);
  });
});

describe('mergePatient: change report', () => {
  it('holds no patient values by default; includeValues adds the incoming value', () => {
    const plain = mergePatient(local, incoming);
    expect(JSON.stringify(plain.changes)).not.toMatch(/joao|souza|9876|1987/i);
    const withValues = mergePatient(local, incoming, { includeValues: true });
    expect(change(withValues.changes, 'telecom[system=email]')?.value).toEqual([
      email('Joao.Souza@example.com'),
    ]);
  });
});

describe('mergePatient: options', () => {
  const untyped = (options: object) => options as MergeOptions;
  it.each<[string, object, ErrorConstructor]>([
    ['an unknown option', { requires: 'match' }, RangeError],
    ['an unknown require', { require: 'maybe' }, RangeError],
    ['an unsupported policy', { policy: 'overwrite' }, RangeError],
    ['an unknown protected path', { protectedPaths: ['birthdate'] }, RangeError],
    ['protected paths that are not an array', { protectedPaths: 'telecom' }, TypeError],
    ['a source that is not a string', { source: 42 }, TypeError],
    ['a match that is not an object', { match: 'match' }, TypeError],
    ['invalid match options', { matchOptions: { thresholds: { match: Number.NaN } } }, RangeError],
  ])('rejects %s', (_, options, error) => {
    expect(() => mergePatient(local, incoming, untyped(options))).toThrow(error);
  });
});
