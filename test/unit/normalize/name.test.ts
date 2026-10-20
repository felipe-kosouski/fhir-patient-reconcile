import { describe, expect, it } from 'vitest';
import { type HumanNameLike, type NormalizedName, normalizeName } from '../../../src/index.js';

interface Case {
  name: HumanNameLike;
  expected: NormalizedName | undefined;
  why: string;
}

const parts = (
  given: string | undefined,
  middle: string[],
  family: string[],
  suffix?: NormalizedName['suffix'],
): NormalizedName => ({ given, middle, family, suffix, source: 'parts' });

const text = (
  given: string | undefined,
  middle: string[],
  family: string[],
  suffix?: NormalizedName['suffix'],
): NormalizedName => ({ given, middle, family, suffix, source: 'text' });

const cases: Case[] = [
  // --- first / middle / family split ---
  {
    name: { family: 'Souza', given: ['João', 'Pedro'] },
    expected: parts('joao', ['pedro'], ['souza']),
    why: 'first given entry is the first name; later given entries are middle names',
  },
  {
    name: { family: 'SOUZA', given: ['Joao'] },
    expected: parts('joao', [], ['souza']),
    why: 'case and accents fold to the same value as the structured name above',
  },
  {
    name: { family: 'Souza', given: ['João Pedro'] },
    expected: parts('joao', ['pedro'], ['souza']),
    why: 'a given entry holding several words is split into tokens',
  },
  {
    name: { family: 'Silva Souza', given: ['Maria'] },
    expected: parts('maria', [], ['silva', 'souza']),
    why: 'Brazilian names often carry several family names; all are kept, in order',
  },
  {
    name: { family: 'Silva-Souza', given: ['Ana'] },
    expected: parts('ana', [], ['silva', 'souza']),
    why: 'hyphenated surnames split into parts, so they can match the unhyphenated form',
  },
  // --- particles ---
  {
    name: { family: 'da Silva Souza', given: ['Maria'] },
    expected: parts('maria', [], ['silva', 'souza']),
    why: '"da" sits between names and is not discriminating',
  },
  {
    name: { family: 'Souza', given: ['Maria de Lourdes'] },
    expected: parts('maria', ['lourdes'], ['souza']),
    why: 'particles inside the given names are dropped too',
  },
  {
    name: { family: 'Santos', given: ['Ana', 'dos'] },
    expected: parts('ana', [], ['santos']),
    why: 'a particle stored as its own given entry is still between names',
  },
  {
    name: { family: 'Da Silva' },
    expected: parts(undefined, [], ['da', 'silva']),
    why: 'with no given name the particle is not between names, so it is kept',
  },
  {
    name: { family: 'De', given: ['Ana'] },
    expected: parts('ana', [], ['de']),
    why: 'a particle at the end is not between names; it may be a real surname',
  },
  // --- generational suffixes ---
  {
    name: { family: 'Souza Filho', given: ['João'] },
    expected: parts('joao', [], ['souza'], 'filho'),
    why: 'Brazilian "Filho" at the end of the family names is a generational suffix',
  },
  {
    name: { family: 'Souza Neto', given: ['João'] },
    expected: parts('joao', [], ['souza'], 'neto'),
    why: '"Neto" (grandson) is a generational suffix in the same position',
  },
  {
    name: { family: 'Neto', given: ['José'] },
    expected: parts('jose', [], ['neto']),
    why: 'a lone "Neto" is the whole family name, so it is kept as a surname',
  },
  {
    name: { family: 'Smith', given: ['John'], suffix: ['Jr.'] },
    expected: parts('john', [], ['smith'], 'junior'),
    why: 'HumanName.suffix is read; "Jr." canonicalizes to junior',
  },
  {
    name: { family: 'Silva Júnior', given: ['Carlos'] },
    expected: parts('carlos', [], ['silva'], 'junior'),
    why: '"Júnior" at the end of family names is the same suffix as "Jr."',
  },
  {
    name: { family: 'Smith', given: ['John'], suffix: ['III'] },
    expected: parts('john', [], ['smith'], 'iii'),
    why: 'roman numerals are generational suffixes',
  },
  {
    name: { family: 'Smith', given: ['John'], suffix: ['MD', 'Sr'] },
    expected: parts('john', [], ['smith'], 'senior'),
    why: 'non-generational suffixes such as degrees are ignored',
  },
  {
    name: { family: 'Souza', given: ['Júnior'] },
    expected: parts('junior', [], ['souza']),
    why: '"Júnior" is a common Brazilian first name; given names are never read as suffixes',
  },
  // --- prefixes ---
  {
    name: { family: 'Souza', given: ['Ana'], prefix: ['Dra.'] },
    expected: parts('ana', [], ['souza']),
    why: 'HumanName.prefix (titles) does not take part in matching',
  },
  {
    name: { family: 'Souza', given: ['Dr. João'] },
    expected: parts('joao', [], ['souza']),
    why: 'a title typed into the given name is dropped, as in text',
  },
  {
    name: { family: 'Souza', given: ['Dr'] },
    expected: parts('dr', [], ['souza']),
    why: 'a lone given token is kept even if it looks like a title: nothing else is left',
  },
  // --- HumanName.text fallback ---
  {
    name: { text: 'Maria da Silva Souza' },
    expected: text('maria', ['silva'], ['souza']),
    why: 'text only: first token is the first name, last token the family name',
  },
  {
    name: { text: 'Dr. João Souza Filho' },
    expected: text('joao', [], ['souza'], 'filho'),
    why: 'text only: leading title dropped, trailing generational suffix extracted',
  },
  {
    name: { text: 'Dr. Dra. Ana Souza' },
    expected: text('ana', [], ['souza']),
    why: 'every leading title is dropped, not just the first',
  },
  {
    name: { text: 'José Neto' },
    expected: text('jose', [], ['neto']),
    why: 'text with two tokens: "Neto" must be the family name, not a suffix',
  },
  {
    name: { text: 'Madonna' },
    expected: text('madonna', [], []),
    why: 'a single-word name is kept as the first name',
  },
  {
    name: { text: 'Ignored Text', family: 'Souza', given: ['Ana'] },
    expected: parts('ana', [], ['souza']),
    why: 'structured parts win over text when both are present',
  },
  // --- placeholders ---
  {
    name: { given: ['RN de Maria'], family: 'Souza' },
    expected: undefined,
    why: 'newborn registered as "RN de <mother>": the name describes the mother, not the baby',
  },
  {
    name: { text: 'Bebê de Ana Souza' },
    expected: undefined,
    why: '"Bebê de <mother>" is the same newborn convention',
  },
  {
    name: { given: ['Recém-Nascido'], family: 'Souza' },
    expected: undefined,
    why: '"recém-nascido" (newborn) as the given name is a placeholder',
  },
  {
    name: { given: ['Baby Girl'], family: 'Smith' },
    expected: undefined,
    why: 'US newborn convention "Baby Girl/Boy <family>"',
  },
  {
    name: { given: ['Bebe'], family: 'Souza' },
    expected: parts('bebe', [], ['souza']),
    why: 'Bebe without "de" can be a real first name, so it is kept',
  },
  {
    name: { given: ['John'], family: 'Doe' },
    expected: undefined,
    why: 'US convention for an unidentified patient',
  },
  {
    name: { text: 'Fulano de Tal' },
    expected: undefined,
    why: 'Brazilian convention for an unnamed person',
  },
  {
    name: { given: ['UNKNOWN'], family: 'Souza' },
    expected: parts(undefined, [], ['souza']),
    why: 'a placeholder given name is missing, not a name; the family name is still usable',
  },
  {
    name: { given: ['Ana'], family: 'Não Informado' },
    expected: parts('ana', [], []),
    why: 'a placeholder family name ("not informed") is missing',
  },
  {
    name: { given: ['Ana', 'Desconhecida'], family: 'Souza' },
    expected: parts('ana', ['desconhecida'], ['souza']),
    why: 'only a whole name part is checked, so the rule cannot eat parts of real names',
  },
  // --- nothing usable ---
  {
    name: {},
    expected: undefined,
    why: 'an empty HumanName has nothing to compare',
  },
  {
    name: { family: ' ', given: ['', '...'], text: '-' },
    expected: undefined,
    why: 'whitespace and punctuation only normalize to nothing',
  },
];

describe('normalizeName', () => {
  it.each(cases)('$why', ({ name, expected }) => {
    expect(normalizeName(name)).toEqual(expected);
  });
});

describe('normalizeName on FHIR JSON', () => {
  it('skips null entries, which FHIR JSON allows in arrays of primitives', () => {
    // `"given": ["Jim", null], "_given": [null, { "extension": [...] }]` is valid FHIR JSON.
    const name = JSON.parse('{"given": ["Jim", null], "family": "Smith", "suffix": [null, "Jr."]}');
    expect(normalizeName(name)).toEqual({
      given: 'jim',
      middle: [],
      family: ['smith'],
      suffix: 'junior',
      source: 'parts',
    });
  });
});
