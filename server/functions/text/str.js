// server/functions/text/str.js
//
// The string coercion used throughout the workflows.
//
// This existed four times over — in jobFinder, linkedinFinder,
// accommodationFinder and chatResults. Three were written
// `String(v ?? "").trim()` and the fourth `v == null ? "" : String(v).trim()`;
// the two forms agree on every input, including 0, false and NaN, so they
// collapse to this one without changing any caller.

/**
 * Coerce any value to a trimmed string.
 *
 * null and undefined become "". Everything else goes through String(), so a
 * number or boolean yields its text rather than "".
 *
 * @param {unknown} v
 * @returns {string}
 */
export function str(v) {
  return String(v ?? "").trim();
}
