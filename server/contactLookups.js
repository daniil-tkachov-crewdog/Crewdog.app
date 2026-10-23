// Cache and kill switch for the Lusha contact lookup.
//
// Split out of server.js for the same reason chatlog.js and traffic.js are:
// these are service-role database calls, and the service-role key is the one
// credential in this app that bypasses RLS. Keeping its three uses in one small
// file makes them reviewable.
//
// app_contact_lookups is readable only through here. The migration enables RLS
// with no policies, so the browser's anon and authenticated keys see nothing —
// the cache holds other people's phone numbers, and a signed-in user has no
// reason to be able to enumerate it.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const enabled = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);
if (!enabled) {
  console.warn(
    "[contacts] SUPABASE_SERVICE_ROLE_KEY or Supabase URL missing — contact lookups will not be cached"
  );
}

const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

// --- kill switch -----------------------------------------------------------

const FLAG_TTL_MS = 60_000;
let flagCache = { value: null, at: 0 };

/**
 * Is the lookup switched on in the admin?
 *
 * Read here, server-side, and deliberately NOT taken from the request body the
 * way /api/chat accepts the finder flags. Those flags only gate features the
 * caller is already paying for with their own token budget; this one gates a
 * third-party bill, so a client-supplied value would be a free way to spend
 * someone else's money.
 *
 * Fails closed: if the setting cannot be read, the answer is off. A lookup that
 * wrongly refuses costs a complaint; one that wrongly proceeds costs credits.
 */
export async function lushaEnabled() {
  if (!enabled) return false;
  if (Date.now() - flagCache.at < FLAG_TTL_MS && flagCache.value !== null) {
    return flagCache.value;
  }
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/app_settings?id=eq.global&select=lusha_enabled`,
      { headers }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const rows = await res.json();
    const value = !!rows?.[0]?.lusha_enabled;
    flagCache = { value, at: Date.now() };
    return value;
  } catch (err) {
    console.error("[contacts] could not read lusha_enabled:", err?.message || err);
    flagCache = { value: false, at: Date.now() };
    return false;
  }
}

// --- cache -----------------------------------------------------------------

const asList = (v) => (Array.isArray(v) ? v.filter(Boolean).map(String) : []);

/**
 * Has this profile's `field` already been bought?
 *
 * Presence of the per-field timestamp is the hit, not presence of a value: a
 * profile Lusha has nothing for is a result worth remembering, or every click
 * on it pays again.
 *
 * @returns {Promise<{phones:string[], emails:string[]}|null>} null on a miss.
 */
export async function readCachedLookup(linkedinUrl, field) {
  if (!enabled) return null;
  const stamp = field === "email" ? "email_checked_at" : "phone_checked_at";
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/app_contact_lookups` +
        `?linkedin_url=eq.${encodeURIComponent(linkedinUrl)}` +
        `&select=phones,emails,${stamp}&limit=1`,
      { headers }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const row = (await res.json())?.[0];
    if (!row || !row[stamp]) return null;
    return { phones: asList(row.phones), emails: asList(row.emails) };
  } catch (err) {
    // A cache that cannot be read must not block the lookup; it just costs a
    // credit we would rather have saved.
    console.error("[contacts] cache read failed:", err?.message || err);
    return null;
  }
}

/**
 * Record what one reveal returned, touching only that field's columns.
 *
 * Writes the timestamp even for an empty result — see readCachedLookup. Merges
 * rather than replaces, so a phone lookup cannot wipe an email bought earlier.
 */
export async function writeCachedLookup(linkedinUrl, field, { phones, emails }) {
  if (!enabled) return;
  const now = new Date().toISOString();
  const row =
    field === "email"
      ? { linkedin_url: linkedinUrl, emails: asList(emails), email_checked_at: now }
      : { linkedin_url: linkedinUrl, phones: asList(phones), phone_checked_at: now };

  try {
    // merge-duplicates: upsert on the primary key, leaving columns this payload
    // does not mention untouched.
    const res = await fetch(`${SUPABASE_URL}/rest/v1/app_contact_lookups`, {
      method: "POST",
      headers: {
        ...headers,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ ...row, updated_at: now }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  } catch (err) {
    // The user already has their answer; losing the cache row only means the
    // next click pays again.
    console.error("[contacts] cache write failed:", err?.message || err);
  }
}
