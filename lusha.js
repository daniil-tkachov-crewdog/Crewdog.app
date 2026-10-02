// Lusha contact lookup — one person, one datapoint, only when asked.
//
// Lusha sells contact details by the datapoint, which makes it the opposite of
// every other outbound call in this codebase: there is no "just check and see".
// A search returning 20 people must cost nothing here, and a click on one card
// must pay for the one thing that card asked for. That constraint is why this
// module exists as its own step rather than hanging off the finder pipeline —
// nothing in a workflow may reach it, only an explicit request for one URL.
//
// Lusha's V3 API splits the work in two for exactly this reason:
//
//   search  -> match the LinkedIn URL to a contact. Returns no PII, and says
//              in `canReveal` what could be unlocked. Cheap.
//   enrich  -> unlock it. Billed per revealed datapoint, which is why the
//              reveal flags below are set one at a time and never both.
//
// Asking for a phone must not quietly pay for an email, so the caller's field
// decides exactly one flag. The two-call cost is the price of that control.

const API_BASE = (process.env.LUSHA_API_BASE || "https://api.lusha.com").replace(
  /\/$/,
  ""
);

// Both calls are a round trip to a third party sitting in front of a user
// watching a spinner. Long enough for a slow match, short enough to fail
// visibly rather than hang.
const TIMEOUT_MS = 15_000;

function apiKey() {
  return String(process.env.LUSHA_API_KEY || "").trim();
}

// POST JSON with a hard timeout. Lusha authenticates on a bare `api_key`
// header, not a bearer token.
async function post(path, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        api_key: apiKey(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // A non-JSON body is almost always an HTML error page from a proxy.
    }
    return { ok: res.ok, status: res.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

// --- lookup ----------------------------------------------------------------

// The reveal values the enrich endpoint accepts, and the response key each one
// fills. Both are fixed by the spec's enum — "email"/"phone" singular is not
// accepted, which is the kind of thing that fails silently as an empty result.
const FIELD = {
  email: { reveal: "emails", key: "emails" },
  phone: { reveal: "phones", key: "phones" },
};

// results[].emails is [{ email, type, confidence, updateDate }] and
// results[].phones is [{ number, type, doNotCall, updateDate }]. Take the one
// string each carries; tolerate a bare string in case the shape ever loosens.
function values(result, key) {
  const list = Array.isArray(result?.[key]) ? result[key] : [];
  const out = [];
  for (const item of list) {
    const v =
      typeof item === "string"
        ? item.trim()
        : String(item?.email ?? item?.number ?? "").trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

function failure(step, res) {
  console.error(`[lusha] ${step} HTTP ${res.status}:`, (res.text || "").slice(0, 300));
  // 402 and 403 are the two worth telling apart on screen: one is a balance to
  // top up, the other a plan that does not sell this at all. Everything else is
  // ours to read in the log, not the user's to decode.
  const message =
    res.status === 401
      ? "Contact lookup is not authorized — check the Lusha API key."
      : res.status === 402
        ? "No Lusha credits left."
        : res.status === 403
          ? "This Lusha plan does not include contact lookup."
          : res.status === 429
            ? "Lusha is rate limiting us — try again shortly."
            : "Contact lookup is unavailable right now.";
  return { status: "error", message };
}

/**
 * Reveal one datapoint for one LinkedIn profile.
 *
 * Follows Lusha's V3 search-then-enrich flow (api.lusha.com/openapi.json):
 *
 *   POST /v3/contacts/search  { contacts: [{ clientReferenceId, linkedinUrl }] }
 *     -> { requestId, results: [{ id, has: [...], canReveal: [{ field, credits }] }] }
 *   POST /v3/contacts/enrich  { ids: [id], reveal: ["phones"] }
 *     -> { requestId, results: [{ emails: [{ email }], phones: [{ number }] }],
 *          billing: { creditsCharged } }
 *
 * Search is the cheap half and carries `canReveal`, which says whether the
 * datapoint exists and what it costs. Checking it before enriching means a
 * profile Lusha has no phone for never reaches the billable call at all.
 *
 * @param {object} args
 * @param {string} args.linkedinUrl Normalized linkedin.com/in/<slug> URL.
 * @param {"phone"|"email"} args.field Which datapoint to pay for.
 * @returns {Promise<{status:"success"|"not_found"|"disabled"|"error", phones?:string[], emails?:string[], message?:string}>}
 *
 * Never throws: the caller is a button with a spinner on it, so every failure
 * has to come back as a value it can render.
 */
export async function lookupContact({ linkedinUrl, field }) {
  if (!apiKey()) {
    return { status: "disabled", message: "Contact lookup is not configured." };
  }
  const spec = FIELD[field];
  if (!spec) return { status: "error", message: "Unknown field." };

  try {
    // 1. Match the URL to a contact. Returns no contact details, so a miss here
    //    costs nothing.
    const search = await post("/v3/contacts/search", {
      contacts: [{ clientReferenceId: "1", linkedinUrl }],
    });
    if (!search.ok) return failure("search", search);

    const results = Array.isArray(search.json?.results) ? search.json.results : [];
    const match = results[0];
    if (!match?.id) return { status: "not_found" };

    // 2. Does Lusha actually hold this datapoint? canReveal lists only what can
    //    be unlocked, so an absent entry means enriching would spend a request
    //    to learn nothing.
    const canReveal = Array.isArray(match.canReveal) ? match.canReveal : [];
    const offer = canReveal.find((c) => c?.field === spec.reveal);
    if (canReveal.length && !offer) return { status: "not_found" };

    // 3. Reveal exactly one datapoint. `reveal` is an enum array: omitting it
    //    returns every email AND phone, which is the expensive default this
    //    whole two-button design exists to avoid.
    const enrich = await post("/v3/contacts/enrich", {
      ids: [String(match.id)],
      reveal: [spec.reveal],
    });
    if (!enrich.ok) return failure("enrich", enrich);

    const found = values(
      (Array.isArray(enrich.json?.results) ? enrich.json.results : [])[0],
      spec.key
    );
    const charged = enrich.json?.billing?.creditsCharged;
    console.log(
      `[lusha] ${field} for ${linkedinUrl}: ${found.length} value(s), credits=${
        charged ?? "?"
      }`
    );

    // A matched contact with nothing revealed is a real answer, not a failure:
    // the caller records it so the same profile is never billed twice.
    if (!found.length) return { status: "not_found" };
    return field === "email"
      ? { status: "success", emails: found, phones: [] }
      : { status: "success", emails: [], phones: found };
  } catch (err) {
    const aborted = err?.name === "AbortError";
    console.error("[lusha] lookup failed:", err?.message || err);
    return {
      status: "error",
      message: aborted
        ? "Contact lookup timed out."
        : "Contact lookup is unavailable right now.",
    };
  }
}
