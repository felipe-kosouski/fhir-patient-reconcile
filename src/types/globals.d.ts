// Globals of every supported runtime (Node.js >= 22, modern browsers) that ES2023's lib lacks.
// Not part of the public types: nothing in the published declarations refers to them.

/** HTML structured clone, available since Node.js 17. Throws on functions. */
declare function structuredClone<T>(value: T): T;
