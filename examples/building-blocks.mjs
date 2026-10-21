// The normalizers and similarity functions matchPatients is built from, also exported.
// Run after `pnpm build`: node examples/building-blocks.mjs (asserts every result the README shows).
import assert from 'node:assert/strict';
import {
  damerauLevenshtein,
  jaroWinkler,
  normalizeAddress,
  normalizeBirthDate,
  normalizeCpf,
  normalizeName,
  normalizePhone,
  normalizeText,
} from 'fhir-patient-reconcile';

assert.deepEqual(normalizeName({ family: 'da Silva Souza Filho', given: ['João Pedro'] }), {
  given: 'joao',
  middle: ['pedro'],
  family: ['silva', 'souza'], // "da" dropped: a particle between names
  suffix: 'filho', // generational suffix, kept for veto checks
  source: 'parts',
});
assert.deepEqual(normalizeName({ text: 'Dra. Maria de Lourdes Souza' }), {
  given: 'maria',
  middle: ['lourdes'],
  family: ['souza'],
  suffix: undefined,
  source: 'text',
});
assert.equal(normalizeText('  D’Ávila-SOUZA '), 'davila souza');

// An old 8-digit Brazilian mobile gains its ninth digit.
assert.deepEqual(normalizePhone('(41) 9876-5432', { defaultCountry: 'BR' }), {
  e164: '+5541998765432',
  line: 'mobile',
  ninthDigitAdded: true,
});
// Also a valid Brazilian landline, and no defaultCountry was given: ambiguous.
assert.equal(normalizePhone('(415) 555-0123'), undefined);

// Placeholders count as missing.
assert.equal(normalizeName({ given: ['RN de Maria'], family: 'Souza' }), undefined);
assert.equal(normalizeBirthDate('1900-01-01'), undefined);
assert.equal(normalizeCpf('000.000.000-00'), undefined); // passes the checksum, still rejected

assert.deepEqual(normalizeBirthDate('1987-03'), {
  value: '1987-03',
  precision: 'month',
  year: 1987,
  month: 3,
  day: undefined,
});
assert.equal(normalizeCpf('111.444.777-35'), '11144477735');

assert.deepEqual(
  normalizeAddress({ line: ['R. das Flores, nº 100'], city: 'Curitiba', postalCode: '80010-000' }),
  {
    line: 'rua das flores 100',
    city: 'curitiba',
    state: undefined,
    postalCode: '80010000',
    country: 'BR',
  },
);
assert.deepEqual(normalizeAddress({ line: ['123 N Main St.'], postalCode: '62701-1234' }), {
  line: '123 north main street',
  city: undefined,
  state: undefined,
  postalCode: '62701',
  country: 'US',
});

assert.equal(jaroWinkler('martha', 'marhta').toFixed(4), '0.9611'); // Winkler's value: 0.961
assert.equal(damerauLevenshtein('CA', 'ABC'), 2); // CA -> AC -> ABC (OSA would give 3)

console.log('examples/building-blocks.mjs OK');
