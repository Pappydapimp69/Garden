// Minimal TOON decoders. Used only by artifact-mode builds; the regular
// dist bundle uses inline JS literals and never imports this file.
//
// TOON (Token-Oriented Object Notation) is a token-efficient JSON
// alternative. We use the smallest possible subset: comma-separated string
// lists. Future build optimizations can grow this without touching call sites.
//
// Runtime contract: input is plain JS text the bundler embedded, output is
// the same JS shape the call site used to receive when it was an inline
// literal.

export function decodeStringList(s) {
  return s.length ? s.split(',') : [];
}
