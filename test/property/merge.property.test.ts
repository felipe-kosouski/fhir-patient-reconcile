// Properties of mergePatient: a refusal is an unchanged copy, local data is never overwritten or
// removed, fill-empty-only never writes where local has data, protected paths and everything
// outside the allowlist stay as they are, the report says what changed, and merging twice
// changes nothing more. The pairs come from `mergePair`, which shares one identity on both
// sides so that most pairs actually merge.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type Change,
  type MergeOptions,
  type MergeResult,
  mergePatient,
  type PatientLike,
} from '../../src/index.js';
import { mergeOptions, mergePair } from './arbitraries.js';

type Json = Record<string, unknown>;
const ALLOWLIST = new Set(['birthDate', 'gender', 'name', 'telecom', 'address']);
const LIST_KEYS = ['name', 'telecom', 'address'] as const;
/** The change-report paths, in report order. */
const PATHS = [
  'birthDate',
  'gender',
  'name',
  'telecom[system=phone]',
  'telecom[system=email]',
  'address',
] as const;
type ReportPath = (typeof PATHS)[number];

const isSet = (value: unknown) => value !== undefined && value !== null;
const json = (patient: PatientLike) => patient as unknown as Json;

/** What a report path covers in a patient: telecom entries are split by system. */
function at(patient: PatientLike, path: ReportPath): unknown {
  const p = json(patient);
  if (path.startsWith('telecom')) {
    const system = path === 'telecom[system=phone]' ? 'phone' : 'email';
    const telecom = p['telecom'];
    if (!isSet(telecom)) return []; // no telecom: no entries of either system
    if (!Array.isArray(telecom)) return telecom;
    return telecom.filter((c) => (c as Json | null)?.['system'] === system);
  }
  return p[path];
}

/** The local record has data at this path, so fill-empty-only must leave it alone. */
function localHasData(local: PatientLike, path: ReportPath): boolean {
  const p = json(local);
  if (path === 'birthDate' || path === 'gender') return isSet(p[path]) || isSet(p[`_${path}`]);
  const value = at(local, path);
  return Array.isArray(value) ? value.some(isSet) : isSet(value);
}

function protects(options: MergeOptions, path: ReportPath): boolean {
  const paths: readonly string[] = options.protectedPaths ?? [];
  if (path.startsWith('telecom')) {
    const sub = path === 'telecom[system=phone]' ? 'telecom.phone' : 'telecom.email';
    return paths.includes('telecom') || paths.includes(sub);
  }
  return paths.includes(path);
}

function appends(options: MergeOptions, path: ReportPath): boolean {
  if (path === 'address') return options.arrays?.address === 'append-new';
  return path.startsWith('telecom') && options.arrays?.telecom === 'append-new';
}

const merge = (local: PatientLike, incoming: PatientLike, options: MergeOptions) =>
  mergePatient(local, incoming, options);

const merged = (result: MergeResult<PatientLike>) => result.status === 'merged';

describe('mergePatient: the generator forces merges', () => {
  // Without this, every property below could pass on refusals alone.
  it('most pairs merge, and every kind of write happens', () => {
    const runs = fc.sample(fc.tuple(mergePair, mergeOptions), { numRuns: 1000, seed: 42 });
    const results = runs.map(([{ local, incoming }, options]) => merge(local, incoming, options));
    const actions = new Set(results.flatMap((r) => r.changes.map((c) => c.action)));
    expect(results.filter(merged).length).toBeGreaterThan(500);
    expect(results.some((r) => r.status === 'refused')).toBe(true);
    for (const action of [
      'filled',
      'appended',
      'kept-local',
      'skipped-duplicate',
      'skipped-protected',
      'skipped-invalid',
    ]) {
      expect(actions, action).toContain(action);
    }
  });
});

describe('mergePatient: refusals', () => {
  it('a refused merge returns an unchanged copy of local and no changes', () => {
    fc.assert(
      fc.property(mergePair, mergeOptions, ({ local, incoming }, options) => {
        const result = merge(local, incoming, options);
        if (result.status !== 'refused') return;
        expect(result.patient).toEqual(local);
        expect(result.patient).not.toBe(local);
        expect(result.changes).toEqual([]);
      }),
    );
  });
});

describe('mergePatient: never overwrites, never removes', () => {
  it('every local element survives: lists keep their entries in front, values stay', () => {
    fc.assert(
      fc.property(mergePair, mergeOptions, ({ local, incoming }, options) => {
        const result = json(merge(local, incoming, options).patient);
        const before = json(local);
        for (const [key, value] of Object.entries(before)) {
          if (Array.isArray(value) && (LIST_KEYS as readonly string[]).includes(key)) {
            expect(Array.isArray(result[key]), key).toBe(true);
            expect((result[key] as unknown[]).slice(0, value.length), key).toEqual(value);
          } else if (isSet(value)) {
            expect(result[key], key).toEqual(value);
          }
        }
      }),
    );
  });

  it('writes only allowlisted elements', () => {
    fc.assert(
      fc.property(mergePair, mergeOptions, ({ local, incoming }, options) => {
        const result = json(merge(local, incoming, options).patient);
        for (const key of Object.keys(result)) {
          if (!ALLOWLIST.has(key)) expect(result[key], key).toEqual(json(local)[key]);
          expect(key in json(local) || ALLOWLIST.has(key), key).toBe(true);
        }
      }),
    );
  });

  it('fill-empty-only never writes where local has data; protected paths never change', () => {
    fc.assert(
      fc.property(mergePair, mergeOptions, ({ local, incoming }, options) => {
        const result = merge(local, incoming, options).patient;
        for (const path of PATHS) {
          const keep =
            protects(options, path) || (localHasData(local, path) && !appends(options, path));
          if (keep) expect(at(result, path), path).toEqual(at(local, path));
        }
      }),
    );
  });

  it('never writes to its inputs or options', () => {
    const deepFreeze = <T>(value: T): T => {
      if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) deepFreeze(child);
        Object.freeze(value);
      }
      return value;
    };
    fc.assert(
      fc.property(mergePair, mergeOptions, ({ local, incoming }, options) => {
        const before = structuredClone({ local, incoming, options });
        deepFreeze({ local, incoming, options });
        merge(local, incoming, options);
        expect({ local, incoming, options }).toEqual(before);
      }),
    );
  });
});

describe('mergePatient: the change report', () => {
  it('filled and appended are reported exactly where the result differs from local', () => {
    fc.assert(
      fc.property(mergePair, mergeOptions, ({ local, incoming }, options) => {
        const result = merge(local, incoming, options);
        const byPath = new Map(result.changes.map((c) => [c.path, c]));
        for (const path of PATHS) {
          const action = byPath.get(path)?.action;
          const changed = !isDeepEqual(at(result.patient, path), at(local, path));
          expect(changed, `${path}: ${action}`).toBe(action === 'filled' || action === 'appended');
        }
      }),
    );
  });

  it('appended and filled entries are counted and fresh', () => {
    fc.assert(
      fc.property(mergePair, mergeOptions, ({ local, incoming }, options) => {
        const result = merge(local, incoming, options);
        for (const change of result.changes) {
          if (change.action !== 'appended' && change.action !== 'filled') continue;
          const path = change.path as ReportPath;
          const after = at(result.patient, path);
          const before = at(local, path);
          const added = Array.isArray(after)
            ? after.slice(Array.isArray(before) ? before.length : 0)
            : [after];
          expect(added.length).toBeGreaterThan(0); // the 10-entry cap is a unit test
          if (change.action === 'appended') expect(change.appended).toBe(added.length);
          expect(change.origin).toBe('incoming');
          expect(change.source).toBe(options.source);
          // Fresh objects: nothing in the result is shared with the incoming record.
          for (const entry of added) {
            if (typeof entry === 'object') expect(sharesObject(entry, incoming)).toBe(false);
          }
        }
      }),
    );
  });

  it('holds only report fields, and patient values only with includeValues', () => {
    const fields = new Set(['path', 'action', 'origin', 'source', 'appended', 'duplicates']);
    fc.assert(
      fc.property(mergePair, mergeOptions, ({ local, incoming }, options) => {
        const { changes } = merge(local, incoming, options);
        for (const change of changes as Change[]) {
          for (const key of Object.keys(change)) {
            if (key === 'value') expect(options.includeValues).toBe(true);
            else expect(fields).toContain(key);
          }
        }
        expect(changes.map((c) => c.path)).toEqual(
          PATHS.filter((p) => changes.some((c) => c.path === p)),
        );
      }),
    );
  });
});

describe('mergePatient: idempotent', () => {
  it('merging the same incoming record again changes nothing', () => {
    fc.assert(
      fc.property(mergePair, mergeOptions, ({ local, incoming }, options) => {
        const once = merge(local, incoming, options);
        const twice = merge(once.patient, incoming, options);
        expect(twice.patient).toEqual(once.patient);
        const actions = twice.changes.map((c) => c.action);
        expect(actions).not.toContain('filled');
        expect(actions).not.toContain('appended');
      }),
    );
  });
});

function isDeepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b) && typeof a === typeof b;
}

/** Whether `value` (or anything inside it) is the very same object as something in `source`. */
function sharesObject(value: object, source: unknown): boolean {
  const seen = new Set<unknown>();
  const collect = (v: unknown) => {
    if (typeof v !== 'object' || v === null || seen.has(v)) return;
    seen.add(v);
    for (const child of Object.values(v)) collect(child);
  };
  collect(source);
  const inside = (v: unknown): boolean =>
    typeof v === 'object' && v !== null && (seen.has(v) || Object.values(v).some(inside));
  return inside(value);
}
