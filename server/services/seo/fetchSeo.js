// server/services/seo/fetchSeo.js
//
// Reads the admin-managed SEO metadata, cached, for the server-rendered head.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const SEO_TTL_MS = 60_000;

// Module-level, so the cache is shared by every request this process serves.
let seoCache = { value: null, at: 0 };

/**
 * Fetch the public SEO metadata, at most once a minute.
 *
 * get_public_seo() is a SECURITY DEFINER function: the metadata is public by
 * definition, so it is readable with the anon key and no session.
 *
 * On failure the previous values keep being served and only the retry clock
 * is reset — blanking the head on a transient Supabase blip would be far
 * worse for crawlers than serving slightly stale copy.
 *
 * @returns {Promise<object|null>} The metadata, or null before the first
 *                                 successful fetch (callers then keep the
 *                                 static fallback already in index.html).
 */
export async function fetchSeo() {
  const fresh = Date.now() - seoCache.at < SEO_TTL_MS;
  if (fresh && seoCache.value) return seoCache.value;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return seoCache.value;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_public_seo`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const seo = await res.json();
    seoCache = { value: seo && typeof seo === "object" ? seo : {}, at: Date.now() };
  } catch (err) {
    console.error("[seo] fetch failed, serving last known values:", err?.message || err);
    // Keep serving the previous values (or the static fallback) rather than
    // blanking the head; only back off from retrying on every request.
    seoCache = { ...seoCache, at: Date.now() };
  }
  return seoCache.value;
}
