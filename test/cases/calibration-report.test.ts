// Generates docs/calibration.md from the hard-case table and the current defaults. CI fails when
// the committed file is stale; regenerate with `pnpm vitest run test/cases -u`.

import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  DEFAULT_THRESHOLDS,
  DEFAULT_WEIGHTS,
  type FieldWeights,
  jaroWinkler,
  type MatchField,
  type MatchOptions,
  matchPatients,
} from '../../src/index.js';
import { DEFAULT_NAME_FUZZY_MIN } from '../../src/match/defaults.js';
import { KNOWN_LIMITATIONS } from './known-limitations.js';
import { type MatchCase, matchCases, meetsExpectation } from './match-cases.js';

const FIELDS = Object.keys(DEFAULT_WEIGHTS) as MatchField[];
const OUTCOMES: readonly (keyof FieldWeights)[] = ['exact', 'fuzzy', 'conflict'];

function run(c: MatchCase, extra: MatchOptions = {}) {
  return matchPatients(c.local, c.incoming, { ...c.options, ...extra });
}

/** Whether each case meets its expected answer under the defaults. */
const baseline: ReadonlyMap<string, boolean> = new Map(
  matchCases.map((c) => [c.id, meetsExpectation(c, run(c))]),
);

/** `+2` / `−2`, with a real minus sign. */
const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`);

const expectedText = (c: MatchCase) =>
  typeof c.expected === 'string' ? c.expected : c.expected.join(' or ');

function casesTable(): string[] {
  const rows = matchCases.map((c) => {
    const r = run(c);
    const status = baseline.get(c.id)
      ? 'pass'
      : KNOWN_LIMITATIONS.has(c.id)
        ? '**known limitation**'
        : '**FAIL**';
    const vetoes = r.vetoes.map((v) => v.code).join(', ') || '';
    return `| \`${c.id}\` | ${expectedText(c)} | ${r.decision} | ${r.matchGrade ?? ''} | ${r.points} | ${vetoes} | ${status} |`;
  });
  return [
    '| Case | Expected | Decision | Grade | Points | Vetoes | Result |',
    '|---|---|---|---|---:|---|---|',
    ...rows,
  ];
}

/** Steps tried in each direction for every setting. */
const MAX_STEP = 10;

interface Probe {
  /** The setting as the table names it, e.g. `given.exact` or `thresholds.match`. */
  setting: string;
  defaultValue: number;
  /** Size of one step: 1 point for weights and thresholds, 0.01 for the name cut-off. */
  unit: number;
  /** Options with the setting moved by `delta`. */
  at: (delta: number) => MatchOptions;
}

function probes(): Probe[] {
  const list: Probe[] = [];
  for (const field of FIELDS) {
    for (const outcome of OUTCOMES) {
      const value = DEFAULT_WEIGHTS[field][outcome];
      list.push({
        setting: `${field}.${outcome}`,
        defaultValue: value,
        unit: 1,
        at: (delta) => ({ weights: { [field]: { [outcome]: value + delta } } }),
      });
    }
  }
  for (const key of ['match', 'possible'] as const) {
    const value = DEFAULT_THRESHOLDS[key];
    list.push({
      setting: `thresholds.${key}`,
      defaultValue: value,
      unit: 1,
      at: (delta) => ({ thresholds: { [key]: value + delta } }),
    });
  }
  list.push({
    setting: 'nameSimilarity.fuzzyMin',
    defaultValue: DEFAULT_NAME_FUZZY_MIN,
    unit: 0.01,
    // Rounded, so 0.92 - 0.06 is 0.86 and not 0.8600000000000001.
    at: (delta) => ({
      nameSimilarity: { fuzzyMin: Math.round((DEFAULT_NAME_FUZZY_MIN + delta) * 100) / 100 },
    }),
  });
  return list;
}

/** Cases that stop meeting, or start meeting, their expected answer; undefined if invalid. */
function changes(options: MatchOptions): { breaks: string[]; fixes: string[] } | undefined {
  const breaks: string[] = [];
  const fixes: string[] = [];
  for (const c of matchCases) {
    let after: boolean;
    try {
      after = meetsExpectation(c, run(c, options));
    } catch (error) {
      if (error instanceof RangeError) return undefined; // e.g. possible above match
      throw error;
    }
    const before = baseline.get(c.id) === true;
    if (before && !after) breaks.push(c.id);
    if (!before && after) fixes.push(c.id);
  }
  return { breaks, fixes };
}

const ids = (list: Iterable<string>) => [...list].map((id) => `\`${id}\``).join(', ');

/** `+2`, `−0.06`: one step count times the probe's unit, with a real minus sign. */
const stepLabel = (probe: Probe, steps: number) =>
  signed(Math.round(steps * probe.unit * 100) / 100);

/**
 * Walks every step in one direction (until the setting becomes invalid). The cell names the
 * first step that breaks a case; every known limitation fixed at any step is collected.
 */
function walk(probe: Probe, sign: 1 | -1, fixes: Map<string, string[]>): string {
  let cell: string | undefined;
  for (let step = 1; step <= MAX_STEP; step++) {
    const result = changes(probe.at(sign * step * probe.unit));
    if (result === undefined) {
      cell ??= `no break before the setting becomes invalid (${stepLabel(probe, sign * step)})`;
      break;
    }
    // Steps grow outward, so the first fix seen per setting is the smallest one.
    const setting = `${probe.setting} ${sign > 0 ? 'raised' : 'lowered'}`;
    for (const id of result.fixes) {
      const seen = fixes.get(id) ?? [];
      if (!seen.some((at) => at.startsWith(setting))) {
        fixes.set(id, [...seen, `${setting} by ${stepLabel(probe, sign * step).slice(1)}`]);
      }
    }
    if (cell === undefined && result.breaks.length > 0) {
      cell = `${stepLabel(probe, sign * step)}: ${ids(result.breaks)}`;
    }
  }
  return cell ?? `no break within ${stepLabel(probe, sign * MAX_STEP)}`;
}

function sensitivity(): { table: string[]; fixes: Map<string, string[]> } {
  const fixes = new Map<string, string[]>();
  const rows = probes().map(
    (probe) =>
      `| ${probe.setting} (${probe.defaultValue}) | ${walk(probe, -1, fixes)} | ${walk(probe, 1, fixes)} |`,
  );
  return { table: ['| Setting (default) | Lowered | Raised |', '|---|---|---|', ...rows], fixes };
}

/** The Jaro-Winkler similarity behind a known limitation, measured, not written by hand. */
function measured(c: MatchCase): string {
  const conflicts = run(c).fields.filter(
    (f) => f.outcome === 'conflict' && f.similarity !== undefined,
  );
  return conflicts.map((f) => `${f.field} Jaro-Winkler ${f.similarity?.toFixed(3)}`).join(', ');
}

function report(): string {
  const sens = sensitivity();
  const passed = [...baseline.values()].filter(Boolean).length;
  const weights = FIELDS.map(
    (f) =>
      `| ${f} | ${DEFAULT_WEIGHTS[f].exact} | ${DEFAULT_WEIGHTS[f].fuzzy} | ${DEFAULT_WEIGHTS[f].conflict} |`,
  );
  return [
    '# Calibration report',
    '',
    '<!-- Generated by test/cases/calibration-report.test.ts. Do not edit by hand; regenerate with `pnpm vitest run test/cases -u`. -->',
    '',
    `The default weights and thresholds checked against the [hard-case table](../test/cases/match-cases.ts): **${passed} of ${matchCases.length} cases pass**, ${KNOWN_LIMITATIONS.size} are documented known limitations.`,
    '',
    'The expected answers were written before any matching code existed (four were added later and are marked in the table: the spelling variants, to document limitations, and boy/girl twins, a false match the session 9 review found and fixed) and are never changed to make a case pass. Points are a heuristic, not a calibrated probability model: they were set by hand against these cases, without real data.',
    '',
    '## Defaults',
    '',
    `\`match\` at ${DEFAULT_THRESHOLDS.match} points (plus no veto and agreeing name, birth date and one of identifier, phone, email or address), \`possible\` at ${DEFAULT_THRESHOLDS.possible} points (plus no veto and one agreeing field besides the name). A missing value scores 0.`,
    '',
    '| Field | exact | fuzzy | conflict |',
    '|---|---:|---:|---:|',
    ...weights,
    '',
    '## Cases',
    '',
    ...casesTable(),
    '',
    '## Known limitations',
    '',
    ...matchCases
      .filter((c) => KNOWN_LIMITATIONS.has(c.id))
      .map((c) => `- \`${c.id}\` (${measured(c)}): ${KNOWN_LIMITATIONS.get(c.id)}`),
    '',
    '## Sensitivity',
    '',
    `For each setting alone, the smallest step (up to ${MAX_STEP} steps of 1 point, or 0.01 for the name cut-off) that makes a passing case fail, everything else at its default. A large margin means the decision comes from the rules (vetoes, minimum evidence) rather than from a finely tuned number.`,
    '',
    ...sens.table,
    '',
    sens.fixes.size === 0
      ? `No single setting in this range makes a known limitation pass.`
      : `Single settings in this range that make a known limitation pass: ${[...sens.fixes].map(([id, at]) => `\`${id}\` (${at.join(', ')})`).join('; ')}. The defaults keep them as limitations on purpose: no case in the table breaks at a lower cut-off, but distinct names would also count as near spellings, for example Lima/Lira (${jaroWinkler('lima', 'lira').toFixed(3)}).`,
    '',
  ].join('\n');
}

// About 27,000 matchPatients calls; the explicit timeout keeps slow CI runners from flaking.
it('docs/calibration.md is up to date', { timeout: 30_000 }, async () => {
  await expect(report()).toMatchFileSnapshot('../../docs/calibration.md');
});

it('the README states the same counts and similarities as the code', () => {
  const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
  const passed = [...baseline.values()].filter(Boolean).length;
  expect(readme).toContain(`${matchCases.length} cases with expected decisions`);
  expect(readme).toContain(`${matchCases.length} difficult pairs`);
  expect(readme).toContain(
    `${passed} of ${matchCases.length} pass, ${KNOWN_LIMITATIONS.size} [known limitations]`,
  );
  // The Known limitations section quotes these pairs with their Jaro-Winkler similarity.
  for (const [a, b] of [
    ['souza', 'sousa'],
    ['luiz', 'luis'],
    ['katia', 'catia'],
  ] as const) {
    expect(readme).toContain(`(${jaroWinkler(a, b).toFixed(3)})`);
  }
});
