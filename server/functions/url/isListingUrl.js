// server/functions/url/isListingUrl.js
//
// Tells one property listing from a page that merely lists properties.

// A portal's search results page or an area landing page is a place to look
// for a home, not a home. The search prompt says so; this is the backstop for
// when the model returns one anyway.
const NOT_A_LISTING =
  /\/(search|find|results|to-rent|for-rent|property-to-rent|rentals?|listings?|properties)\/?$|[?&](q|query|keywords|search|searchType|locationIdentifier)=/i;

/**
 * True when the URL looks like an individual property rather than a search.
 *
 * A bare host with no path is never a listing. Anything unparseable is
 * rejected rather than let through — a URL that will not parse cannot be
 * shown to the user as a link anyway.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isListingUrl(url) {
  try {
    const u = new URL(url);
    if (u.pathname === "/" || u.pathname === "") return false;
    return !NOT_A_LISTING.test(u.pathname + u.search);
  } catch {
    return false;
  }
}
