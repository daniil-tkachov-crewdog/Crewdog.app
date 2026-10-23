// server/functions/text/renderTemplate.js
//
// Fills {{placeholders}} in an admin-edited prompt from the values a run
// actually has.
//
// Every prompt the app sends is editable in the admin panel, and the ones
// that carry a search's own criteria into the model need somewhere to put
// them — this is that seam.

/**
 * Substitute {{name}} placeholders.
 *
 * An unknown placeholder is left exactly as written rather than blanked, so a
 * typo in the admin panel shows up in the prompt instead of silently deleting
 * a line.
 *
 * @param {unknown} template  The prompt text.
 * @param {Record<string, unknown>} vars
 * @returns {string}
 */
export function renderTemplate(template, vars = {}) {
  return String(template ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key) =>
    key in vars ? String(vars[key] ?? "") : whole
  );
}
