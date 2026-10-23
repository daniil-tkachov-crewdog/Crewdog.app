// server/functions/html/metaProp.js
//
// One <meta property="…"> tag for the server-rendered SEO head. Open Graph
// uses `property` where the HTML spec uses `name`, hence the separate helper.

import { escapeAttr } from "./escapeAttr.js";

/**
 * Render a property/content meta tag, or nothing at all.
 *
 * @param {string} prop     The property, e.g. "og:title".
 * @param {unknown} content The value; falsy means omit the tag entirely.
 * @returns {string}        The tag, or "".
 */
export function metaProp(prop, content) {
  return content ? `<meta property="${prop}" content="${escapeAttr(content)}" />` : "";
}
