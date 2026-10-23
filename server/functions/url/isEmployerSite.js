// server/functions/url/isEmployerSite.js
//
// Tells a hiring company's own website from the platforms and boards it
// advertises on.

import {
  NOT_EMPLOYER_HOSTS,
  NOT_EMPLOYER_PATTERNS,
} from "../../constants/notEmployerHosts.js";

/**
 * True when the URL is on a domain the hiring company itself owns — which is
 * everything left once the platforms and the boards are taken out.
 *
 * This decides the "direct" versus "board" split in job results. An
 * unparseable URL is not a company site.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isEmployerSite(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  if (NOT_EMPLOYER_HOSTS.some((d) => host === d || host.endsWith(`.${d}`))) return false;
  return !NOT_EMPLOYER_PATTERNS.some((re) => re.test(host));
}
