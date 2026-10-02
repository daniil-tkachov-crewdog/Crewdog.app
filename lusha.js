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

// --- response parsing ------------------------------------------------------
//
// Lusha has shipped three generations of this API and moves field names
// between them (emailAddresses/emails, phoneNumbers/phones, values that are
// bare strings in one version and { email } / { number } objects in another).
// Rather than pin one spelling and break on the next revision, walk the
// response and collect from any key that names the thing we asked for. Only
// keys matching /email/i or /phone|number/i are read, so this cannot scrape
// unrelated strings out of the payload.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function collect(node, keyRe, pick, out, depth = 0) {
  if (!node || depth > 8) return out;
  if (Array.isArray(node)) {
    for (const item of node) collect(item, keyRe, pick, out, depth + 1);
    return out;
  }
  if (typeof node !== "object") return out;

  for (const [key, value] of Object.entries(node)) {
    if (keyRe.test(key)) {
      for (const v of Array.isArray(value) ? value : [value]) {
        const got = pick(v);
        if (got && !out.includes(got)) out.push(got);
      }
    }
    // Keep descending regardless: the hit may be nested under `data`,
    // `contacts`, or a per-contact wrapper keyed by id.
    if (value && typeof value === "object") {
      collect(value, keyRe, pick, out, depth + 1);
    }
  }
  return out;
}

function pickEmail(v) {
  if (typeof v === "string") return EMAIL_RE.test(v.trim()) ? v.trim() : "";
  if (v && typeof v === "object") {
    for (const k of ["email", "emailAddress", "address", "value"]) {
      const s = String(v[k] ?? "").trim();
      if (EMAIL_RE.test(s)) return s;
    }
  }
  return "";
}

function pickPhone(v) {
  const clean = (s) => {
    const str = String(s ?? "").trim();
    // At least 7 digits, and nothing but phone-shaped characters. Rules out
    // ids, counts and booleans that happen to live under a *Number key.
    const digits = str.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 20) return "";
    return /^[+()\d\s.-]+$/.test(str) ? str : "";
  };
  if (typeof v === "string" || typeof v === "number") return clean(v);
  if (v && typeof v === "object") {
    for (const k of ["number", "phoneNumber", "internationalNumber", "value"]) {
      const got = clean(v[k]);
      if (got) return got;
    }
  }
  return "";
}

export function extractEmails(json) {
  return collect(json, /email/i, pickEmail, []);
}

export function extractPhones(json) {
  return collect(json, /phone|^number$|Number$/i, pickPhone, []);
}

// --- lookup ----------------------------------------------------------------

/**
 * Reveal one datapoint for one LinkedIn profile.
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
  const wantEmail = field === "email";

  try {
    // 1. Match the URL to a contact. No PII, so a miss here costs nothing.
    const search = await post("/v3/contacts/search", {
      contacts: [{ contactId: "1", linkedinUrl }],
    });

    if (!search.ok) {
      console.error(
        `[lusha] search HTTP ${search.status}:`,
        (search.text || "").slice(0, 300)
      );
      return {
        status: "error",
        message:
          search.status === 401 || search.status === 403
            ? "Contact lookup is not authorized."
            : "Contact lookup is unavailable right now.",
      };
    }

    const requestId = search.json?.requestId ?? search.json?.request_id ?? "";
    const matches = Array.isArray(search.json?.contacts)
      ? search.json.contacts
      : [];
    const first = matches[0];
    if (!requestId || !first) return { status: "not_found" };

    // Lusha echoes our contactId and adds its own; the enrich step wants
    // whichever one it issued.
    const id = first.id ?? first.contactId ?? first.contact_id ?? "1";

    // 2. Reveal exactly one datapoint. Both flags are always sent, one of them
    //    false, so a future default-on cannot bill us for the other.
    const enrich = await post("/v3/contacts/enrich", {
      requestId,
      contactIds: [String(id)],
      revealEmails: wantEmail,
      revealPhones: !wantEmail,
    });

    if (!enrich.ok) {
      console.error(
        `[lusha] enrich HTTP ${enrich.status}:`,
        (enrich.text || "").slice(0, 300)
      );
      return { status: "error", message: "Contact lookup is unavailable right now." };
    }

    const emails = wantEmail ? extractEmails(enrich.json) : [];
    const phones = wantEmail ? [] : extractPhones(enrich.json);
    const found = wantEmail ? emails.length : phones.length;

    // A matched contact with nothing revealed is a real answer, not a failure:
    // the caller records it so the same profile is never billed twice.
    if (!found) return { status: "not_found" };
    return { status: "success", emails, phones };
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
