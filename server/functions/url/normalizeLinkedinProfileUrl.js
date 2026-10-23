// server/functions/url/normalizeLinkedinProfileUrl.js
//
// Canonicalises a LinkedIn profile URL.
//
// Named for what it does, because it is not the same function as
// normalizeListingUrl: this one accepts only linkedin.com/in/<slug> and
// rebuilds the URL from the slug, where that one accepts any host and only
// cleans the URL it was given. Both were called `normalizeUrl` in different
// files, which made them look interchangeable. They are not.

const PROFILE_RE = /^https?:\/\/([a-z0-9-]+\.)*linkedin\.com\/in\/[^/?#\s]+/i;

/**
 * Reduce a LinkedIn profile URL to its canonical form.
 *
 * Strips tracking parameters, trailing slashes and the locale subdomain
 * (uk.linkedin.com, de.linkedin.com …) so the same person found twice under
 * different URLs collapses to one row.
 *
 * The contact-lookup cache keys on this too: the same person has to be one
 * cache row for the same reason they are one result row — and because a URL
 * that does not normalise is never allowed to become a billable Lusha call.
 *
 * @param {unknown} url
 * @returns {string} "https://www.linkedin.com/in/<slug>", or "" for anything
 *                   that is not a profile URL.
 */
export function normalizeLinkedinProfileUrl(url) {
  const raw = String(url ?? "").trim();
  if (!PROFILE_RE.test(raw)) return "";
  try {
    const u = new URL(raw);
    const slug = u.pathname.replace(/\/+$/, "").split("/in/")[1] ?? "";
    if (!slug) return "";
    return `https://www.linkedin.com/in/${decodeURIComponent(slug).toLowerCase()}`;
  } catch {
    return "";
  }
}
