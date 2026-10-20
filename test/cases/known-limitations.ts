// Hard cases the matcher does not get right, each with why. The expected answers in the table
// stay as written; a case leaves this list only when the code reaches its answer (the runner
// uses `it.fails`, so a fixed case turns the suite red until it is removed from here).

export const KNOWN_LIMITATIONS: ReadonlyMap<string, string> = new Map([
  [
    'family-spelling-variant-z-s',
    'Souza/Sousa scores 0.907 Jaro-Winkler, below the 0.92 cut-off, so the family names conflict. The pair goes to review (possible) instead of matching.',
  ],
  [
    'given-spelling-variant-z-s',
    'Luiz/Luis scores 0.883 Jaro-Winkler, below the 0.92 cut-off. The pair goes to review (possible) instead of matching.',
  ],
  [
    'given-spelling-variant-k-c',
    'Kátia/Cátia differ in the first letter, which Jaro-Winkler weighs heavily (0.867). The pair goes to review (possible) instead of matching.',
  ],
]);
