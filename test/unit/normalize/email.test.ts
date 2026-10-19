import { describe, expect, it } from 'vitest';
import { normalizeEmail } from '../../../src/index.js';

// [input, expected, why]
const cases: ReadonlyArray<readonly [string, string | undefined, string]> = [
  [' Joao.Souza@Example.COM ', 'joao.souza@example.com', 'trimmed and case-folded'],
  ['mailto:ana@example.com', 'ana@example.com', 'mailto: prefix removed'],
  ['ａｎａ@example.com', 'ana@example.com', 'full-width characters fold under NFKC'],
  ['ana+hie@example.com', 'ana+hie@example.com', 'plus tags kept: no provider-specific rules'],
  ['j.o.a.o@gmail.example', 'j.o.a.o@gmail.example', 'dots kept: no Gmail-style rules by default'],
  ['ana@example', undefined, 'domain without a dot is not a usable address'],
  ['ana.example.com', undefined, 'no @'],
  ['a@b@example.com', undefined, 'more than one @'],
  ['@example.com', undefined, 'empty local part'],
  ['ana souza@example.com', undefined, 'whitespace inside the address'],
  ['ana@.example.com', undefined, 'domain label cannot be empty'],
  ['noemail@example.com', undefined, 'placeholder local part'],
  ['sem.email@example.com', undefined, 'placeholder local part (Portuguese), separators ignored'],
  ['naotem@example.com', undefined, 'placeholder local part (Portuguese "does not have")'],
  ['ana@noemail.com', undefined, 'placeholder domain'],
  ['', undefined, 'empty'],
];

describe('normalizeEmail', () => {
  it.each(cases)('%j -> %j (%s)', (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });
});
