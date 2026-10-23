// server/functions/url/normalizeListingUrl.js
//
// Canonicalises an advert or property URL so the same thing found twice under
// two campaign URLs collapses to one result.
//
// The job finder and the accommodation finder had this body character for
// character, differing only in which query parameters each strips. That
// difference is real — Greenhouse's gh_ is meaningless on a property portal,
// and gclid/fbclid never appear on an ATS — so the pattern is a parameter
// here rather than a union of both lists, and each caller keeps the behaviour
// it had.

import { str } from "../text/str.js";

/**
 * Canonicalise an http(s) URL.
 *
 * Unlike a LinkedIn profile URL this accepts any host: an advert legitimately
 * lives on a career page, an ATS domain, a board or an agent's own site, so
 * the only shape rule is "an http(s) URL with a dotted host".
 *
 * Strips the matching query parameters, drops the fragment, lowercases the
 * host and removes a leading "www." and any trailing slashes.
 *
 * @param {unknown} url               The URL as the model returned it.
 * @param {RegExp}  trackingParamRe   Tested against each query parameter name;
 *                                    matches are removed.
 * @returns {string} The canonical URL, or "" when the input will not parse.
 *                   Never throws — a bad URL is a dropped result, not a
 *                   failed search.
 */
export function normalizeListingUrl(url, trackingParamRe) {
  const raw = str(url);
  if (!/^https?:\/\//i.test(raw)) return "";
  try {
    const u = new URL(raw);
    if (!u.hostname.includes(".")) return "";
    for (const key of [...u.searchParams.keys()]) {
      if (trackingParamRe.test(key)) u.searchParams.delete(key);
    }
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return u.toString();
  } catch {
    return "";
  }
}
