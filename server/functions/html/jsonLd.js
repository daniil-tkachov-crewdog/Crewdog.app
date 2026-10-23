// server/functions/html/jsonLd.js
//
// Serialiser for the JSON-LD blocks in the server-rendered SEO head.

/**
 * Pretty-print an object as JSON-LD for inlining in a <script> tag.
 *
 * `<` is escaped to <, which JSON parsers read back as `<` but an HTML
 * tokeniser does not: without it a value containing "</script>" would close
 * the surrounding tag and the rest would be parsed as markup.
 *
 * @param {unknown} obj  Any JSON-serialisable value.
 * @returns {string}     Indented JSON, safe to inline in a script element.
 */
export function jsonLd(obj) {
  return JSON.stringify(obj, null, 2).replace(/</g, "\\u003c");
}
