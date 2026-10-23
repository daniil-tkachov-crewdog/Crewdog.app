// server/functions/json/parseJsonOrDefault.js
//
// Best-effort JSON parse for model output.

/**
 * Parse JSON, tolerating the wrapping a model sometimes adds.
 *
 * A straight parse is tried first. Failing that, the first {...} span in the
 * text is tried, which recovers the common cases: a fenced ```json block, or
 * a sentence of prose before or after the object. Anything still unparseable
 * yields the fallback rather than throwing — one malformed reply should cost
 * a stage, not the whole run.
 *
 * @template T
 * @param {string} text
 * @param {T} fallback
 * @returns {unknown|T}
 */
export function parseJsonOrDefault(text, fallback) {
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* ignore */
      }
    }
    return fallback;
  }
}
