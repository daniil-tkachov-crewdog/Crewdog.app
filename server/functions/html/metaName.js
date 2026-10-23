// server/functions/html/metaName.js
//
// One <meta name="…"> tag for the server-rendered SEO head.

import { escapeAttr } from "./escapeAttr.js";

/**
 * Render a name/content meta tag, or nothing at all.
 *
 * An empty value yields an empty string rather than an empty tag, because the
 * caller joins the whole head with filter(Boolean): a tag with no content is
 * worse than no tag, since crawlers read it as an explicit blank.
 *
 * @param {string} name     The meta name, e.g. "description".
 * @param {unknown} content The value; falsy means omit the tag entirely.
 * @returns {string}        The tag, or "".
 */
export function metaName(name, content) {
  return content ? `<meta name="${name}" content="${escapeAttr(content)}" />` : "";
}
