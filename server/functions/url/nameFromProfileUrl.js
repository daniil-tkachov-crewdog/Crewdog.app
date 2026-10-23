// server/functions/url/nameFromProfileUrl.js
//
// Recovers a readable name from a LinkedIn profile slug.

/**
 * Derive a display name from a profile URL.
 *
 * For the profiles whose name the search could not read. Without this such a
 * person is dropped on the floor: the card list requires a name, so a
 * nameless row collapses the whole group and the reply falls back to printing
 * bare "Profile" links.
 *
 * linkedin.com/in/jan-de-vries-8b41720a -> "Jan De Vries". The trailing hash
 * LinkedIn appends to disambiguate is dropped; a slug that is all hash, or a
 * single run of letters, yields "" rather than a nonsense name.
 *
 * @param {unknown} url
 * @returns {string} The name, or "".
 */
export function nameFromProfileUrl(url) {
  const slug = String(url ?? "")
    .split("/in/")[1]
    ?.split(/[/?#]/)[0];
  if (!slug) return "";
  const words = decodeURIComponent(slug)
    .split("-")
    // The disambiguating suffix is hex, so a word with a digit in it is never
    // part of the name.
    .filter((w) => w && !/\d/.test(w));
  if (words.length < 2) return "";
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}
