// Shared link verification for the two "find me a live advert" workflows.
//
// Both the job finder and the accommodation finder used to take the model's
// word for whether an advert was still open. They could not do otherwise: a
// web search reads a search index, and an index is a snapshot. Expired job ads
// and let-agreed properties are the most heavily indexed pages those sites
// have — they sat still the longest — so "posted 4 days ago, still open" was
// routinely true of a snapshot and false of the page. Every link had to be
// followed by hand before anyone found out.
//
// So we follow them here, before the user sees them. No model call, no tokens:
// a plain GET per candidate, run in a small pool, with three possible verdicts.
//
//   dead    -> the page says it is over, or is not there. Dropped.
//   live    -> fetched, and nothing says it is over. Shown as verified.
//   unknown -> we were blocked or could not tell. Shown, flagged unverified.
//
// The third verdict is the important one. Rightmove, Indeed and LinkedIn block
// datacentre IPs hard and constantly, and treating a 403 as death would empty
// every list we produce — a worse failure than the one this fixes. So only
// positive evidence of death drops a listing; absence of evidence flags it.

// A dead advert usually answers 200, not 404: the site keeps the URL and swaps
// the body for "this job is no longer available". That soft 404 is the single
// biggest source of dead ends, and the only way to see it is to read the text.
//
// These defaults are deliberately written as sentences a page states about
// ITSELF, not as bare status words. "under offer" alone would match a live
// listing that happens to show a sold neighbour in a sidebar; "this property is
// under offer" would not. Both lists are editable per workflow in the admin.
export const JOB_EXPIRY_PHRASES = [
  "no longer accepting applications",
  "we are no longer accepting",
  "this job is no longer available",
  "this job has expired",
  "this job posting has expired",
  "this vacancy has expired",
  "this vacancy is now closed",
  "this position has been filled",
  "this role has been filled",
  "this job has been filled",
  "applications for this job are closed",
  "applications are now closed",
  "closed for applications",
  "this listing has expired",
  "job not found",
  "this job is closed",
];

export const PROPERTY_EXPIRY_PHRASES = [
  "this property is no longer available",
  "this property has been let",
  "this property has been removed",
  "this property is under offer",
  "this property is sold",
  "sold subject to contract",
  "this listing is no longer available",
  "this listing has expired",
  "this advert has expired",
  "this advert has been removed",
  "this room has been taken",
  "this room is no longer available",
  "no longer on the market",
  "this property has been withdrawn",
  "property not found",
];

// Sent so we look like a browser rather than a script. Plenty of portals serve
// a 403 to anything that does not, and a 403 costs us a verified listing.
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
};

const TIMEOUT_MS = 6000;
const CONCURRENCY = 6;
// Enough of the page to carry the headline, the status banner and the opening
// of the body copy. Reading megabytes of listing markup buys nothing.
const MAX_BYTES = 300_000;

// Connection-level failures that mean the address itself is gone, as opposed to
// a server that is merely slow or unhappy. These are safe to call dead; a
// timeout or a 5xx is not, and falls through to "unknown".
const DEAD_NETWORK_CODES = new Set([
  "ENOTFOUND",
  "ECONNREFUSED",
  "EAI_AGAIN",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
]);

function errorCode(err) {
  return String(err?.cause?.code ?? err?.code ?? "");
}

// Read at most MAX_BYTES of the body, then stop pulling. Some listing pages are
// enormous and we only ever look near the top.
async function readCapped(res) {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
      if (size >= MAX_BYTES) break;
    }
  } catch {
    // A body that dies mid-read still gives us whatever arrived.
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* already closed */
    }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(
    chunks.length === 1 ? chunks[0] : Buffer.concat(chunks.map((c) => Buffer.from(c)))
  );
}

// Markup out, words in. Script and style bodies go first so a phrase sitting in
// a JSON blob or an analytics payload cannot pass for page copy.
export function htmlToText(html) {
  return String(html ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

// Admin edits arrive as a textarea: one phrase per line, blanks and stray
// punctuation ignored.
export function parsePhrases(value, fallback) {
  const lines = String(value ?? "")
    .split("\n")
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean);
  return lines.length ? lines : fallback;
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "your", "our", "you",
  "are", "job", "role", "jobs", "new", "all", "any", "per", "ltd", "limited",
  "plc", "inc", "llc", "group", "uk", "london", "rent", "sale", "bed", "bedroom",
  "flat", "house", "room", "apartment", "studio", "property", "properties",
]);

// Words distinctive enough that a page about this advert should contain at
// least one of them. Short words and the vocabulary every listing shares are
// stripped, so what remains is company names, place names and job titles.
function significantWords(text) {
  return [
    ...new Set(
      String(text ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
    ),
  ];
}

// One candidate, one GET, one verdict.
async function checkOne(item, opts) {
  const { phrases, isDeadEndUrl } = opts;
  const url = item.url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: HEADERS,
      signal: controller.signal,
    });

    const status = res.status;
    const finalUrl = res.url || url;

    // Gone means gone.
    if (status === 404 || status === 410) {
      return { verdict: "dead", status, final_url: finalUrl, reason: `http_${status}` };
    }
    // Blocked, rate-limited or broken upstream: we learned nothing about the
    // advert, only about their firewall. Keep it, flag it.
    if (status === 401 || status === 403 || status === 429 || status === 999 || status >= 500) {
      return { verdict: "unknown", status, final_url: finalUrl, reason: `http_${status}` };
    }
    if (status >= 400) {
      return { verdict: "unknown", status, final_url: finalUrl, reason: `http_${status}` };
    }

    // The classic dead end: the listing is gone, so the site quietly bounces us
    // to its search page or its homepage. The URL still "works"; there is just
    // nothing behind it. isDeadEndUrl is the caller's own category-page test,
    // the same one it already applies to search results.
    if (finalUrl !== url && isDeadEndUrl && isDeadEndUrl(finalUrl)) {
      return { verdict: "dead", status, final_url: finalUrl, reason: "redirected_to_index" };
    }

    const text = htmlToText(await readCapped(res));

    // A page that rendered nothing readable is a page we cannot judge — a
    // client-rendered portal, usually. Flag rather than guess.
    if (text.length < 200) {
      return { verdict: "unknown", status, final_url: finalUrl, reason: "empty_body" };
    }

    const hit = phrases.find((p) => text.includes(p));
    if (hit) {
      return { verdict: "dead", status, final_url: finalUrl, reason: `expired_text:${hit}` };
    }

    // Last check: does this page have anything to do with the advert the model
    // described? A fabricated or mistyped URL that happens to resolve lands
    // here. Only run it when the model gave us something distinctive to match
    // and the page gave us real copy to match against.
    const claim = significantWords(`${item.title ?? ""} ${item.company ?? ""}`);
    if (claim.length >= 2 && text.length > 600) {
      const matched = claim.filter((w) => text.includes(w)).length;
      if (matched === 0) {
        return { verdict: "dead", status, final_url: finalUrl, reason: "content_mismatch" };
      }
    }

    return { verdict: "live", status, final_url: finalUrl, reason: "ok" };
  } catch (err) {
    const code = errorCode(err);
    if (DEAD_NETWORK_CODES.has(code)) {
      return { verdict: "dead", status: 0, final_url: url, reason: `network:${code}` };
    }
    // Timeouts and everything else: unproven either way.
    const aborted = err?.name === "AbortError";
    return {
      verdict: "unknown",
      status: 0,
      final_url: url,
      reason: aborted ? "timeout" : `network:${code || "error"}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Follow every candidate link and say which survived.
 *
 * @param {Array<{url:string,title?:string,company?:string}>} items candidates, already deduped
 * @param {{phrases:string[], isDeadEndUrl?:(url:string)=>boolean}} opts
 * @returns {Promise<{kept:Array, dropped:Array, stats:object}>}
 *   kept items carry `verified` (true when proven live) and `check`; the
 *   caller decides how many to show. Order is preserved: the search already
 *   ranked these, and a checker has no opinion about relevance.
 */
export async function verifyLinks(items, opts = {}) {
  const list = Array.isArray(items) ? items : [];
  const phrases = Array.isArray(opts.phrases) && opts.phrases.length ? opts.phrases : [];
  if (!list.length) {
    return { kept: [], dropped: [], stats: { checked: 0, live: 0, unknown: 0, dead: 0 } };
  }

  const results = new Array(list.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= list.length) return;
      results[i] = await checkOne(list[i], { phrases, isDeadEndUrl: opts.isDeadEndUrl });
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, list.length) }, () => worker())
  );

  const kept = [];
  const dropped = [];
  const stats = { checked: list.length, live: 0, unknown: 0, dead: 0 };

  list.forEach((item, i) => {
    const check = results[i] ?? { verdict: "unknown", reason: "not_checked", status: 0 };
    stats[check.verdict] = (stats[check.verdict] ?? 0) + 1;
    if (check.verdict === "dead") {
      dropped.push({ url: item.url, reason: check.reason });
      return;
    }
    kept.push({
      ...item,
      // A redirect that did NOT land on an index page is the site's own
      // canonical URL for this advert; hand the user that one.
      url: check.final_url && check.verdict === "live" ? check.final_url : item.url,
      verified: check.verdict === "live",
      check: { status: check.status, reason: check.reason },
    });
  });

  return { kept, dropped, stats };
}
