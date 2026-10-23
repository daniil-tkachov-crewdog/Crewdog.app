// server/functions/html/escapeAttr.js
//
// Escaping for text that is about to be interpolated into an HTML attribute.
// Used by the server-rendered SEO head, whose values come from the admin panel
// and so must never be able to break out of the attribute they sit in.

/**
 * Escape the four characters that can terminate or reopen an HTML attribute.
 *
 * Ampersand is replaced first; doing it later would double-escape the
 * entities introduced by the replacements before it.
 *
 * @param {unknown} s  Any value; coerced with String().
 * @returns {string}   Safe to place inside a double-quoted attribute.
 */
export function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
