// AI usage limits — Claude-style rolling 5-hour and weekly windows.
//
// Why "units" and not raw tokens
// ------------------------------
// GPT-5 output costs 8x what input costs ($10.00 vs $1.25 per 1M tokens), so a
// cap on raw total_tokens lets an output-heavy user cost 8x more than an
// input-heavy one for the same allowance. Everything here is therefore metered
// in *input-equivalent units*:
//
//     units = input + 8 x output + 0.1 x cached_input          1M units = $1.25
//
// Budget: a Pro subscriber (£19.50/mo) must not cost more than £5/week.
// £5 ~ $6.35 -> 5.08M units -> 5,000,000 units/week. The 5-hour window is
// 12.5% of that, so it takes ~8 heavy sessions to exhaust the week.
// At a typical 80/20 input/output mix that is ~2.1M real tokens/week.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const ACCOUNT_API_BASE = (process.env.VITE_API_BASE || "").replace(/\/$/, "");

// Price ratio between output and input tokens for the active model. GPT-5 is
// $10.00 / $1.25 = 8. Override with OPENAI_OUTPUT_RATIO if the model changes.
const OUTPUT_RATIO = Number(process.env.OPENAI_OUTPUT_RATIO) || 8;
const CACHED_INPUT_RATIO = Number(process.env.OPENAI_CACHED_RATIO) || 0.1;

export const DEFAULT_LIMITS = {
  pro: { five_hour: 625_000, week: 5_000_000 },
  free: { five_hour: 100_000, week: 500_000 },
};

export const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Converts an OpenAI usage object into input-equivalent units.
export function toUnits(usage) {
  const input = Number(usage?.input_tokens ?? 0);
  const output = Number(usage?.output_tokens ?? 0);
  const cached = Number(
    usage?.input_tokens_details?.cached_tokens ?? usage?.cached_tokens ?? 0
  );
  // Cached input is already counted inside input_tokens, so discount it rather
  // than adding it again: it bills at 10% of the normal input rate.
  const billableInput = Math.max(0, input - cached) + cached * CACHED_INPUT_RATIO;
  return Math.round(billableInput + output * OUTPUT_RATIO);
}

// --- small TTL cache -------------------------------------------------------

const cache = new Map();
const cacheGet = (key) => {
  const hit = cache.get(key);
  if (!hit || Date.now() > hit.expires) return undefined;
  return hit.value;
};
const cacheSet = (key, value, ttlMs) => {
  cache.set(key, { value, expires: Date.now() + ttlMs });
  return value;
};

// --- auth ------------------------------------------------------------------

// Verifies a Supabase access token against the Auth API and returns the user.
// Tokens are cached for 60s so a burst of chats does not mean a round-trip each.
export async function verifyAccessToken(token) {
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  const key = `tok:${token}`;
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return cacheSet(key, null, 30_000);
    const user = await res.json();
    if (!user?.id) return cacheSet(key, null, 30_000);
    return cacheSet(key, user, 60_000);
  } catch (err) {
    console.error("[usage] token verification failed:", err?.message || err);
    return null;
  }
}

// Express middleware: populates req.authUser / req.userId / req.accessToken when
// a valid bearer token is present. It never rejects — routes decide whether auth
// is required. The token is kept because every metering call is made *as* the
// user, which is what removes the need for a service-role key.
export async function attachUser(req, _res, next) {
  const header = req.get?.("authorization") || req.headers?.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const user = await verifyAccessToken(token);
  req.authUser = user;
  req.userId = user?.id ?? null;
  req.accessToken = user ? token : null;
  next();
}

export function isAdminUser(user) {
  const app = user?.app_metadata ?? {};
  const meta = user?.user_metadata ?? {};
  const role = String(app.role ?? meta.role ?? user?.role ?? "").toLowerCase();
  return role === "admin" || app.isAdmin === true || meta.isAdmin === true;
}

// --- plan ------------------------------------------------------------------

// The billing backend is the source of truth for subscription state; mirror the
// status list used by normalizeSummary() in src/services/account.ts.
const PAID_STATUSES = ["active", "trialing", "past_due", "unpaid"];

export async function planForUser(userId) {
  if (!userId || !ACCOUNT_API_BASE) return "free";

  const key = `plan:${userId}`;
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  try {
    const res = await fetch(`${ACCOUNT_API_BASE}/account/summary/${userId}`, {
      cache: "no-store",
    });
    if (!res.ok) return cacheSet(key, "free", 60_000);
    const s = await res.json();
    const paid =
      s?.unlimited === true ||
      s?.isAdmin === true ||
      PAID_STATUSES.includes(String(s?.status ?? "").toLowerCase());
    return cacheSet(key, paid ? "pro" : "free", 60_000);
  } catch (err) {
    // Fail closed onto the free tier rather than handing out Pro allowances.
    console.error("[usage] plan lookup failed:", err?.message || err);
    return cacheSet(key, "free", 30_000);
  }
}

// Admin-configured overrides (app_settings.usage_limits), merged over the
// defaults above. Read as the signed-in user — the existing RLS on app_settings
// already lets any authenticated user read the row. Cached for 60s like the SEO
// block in server.js.
export async function limitsForPlan(plan, token) {
  const base = DEFAULT_LIMITS[plan] ?? DEFAULT_LIMITS.free;
  const cached = cacheGet("limits");
  if (cached !== undefined) return { ...base, ...(cached?.[plan] ?? {}) };

  let configured = {};
  if (SUPABASE_URL && SUPABASE_ANON_KEY && token) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/app_settings?id=eq.global&select=usage_limits`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (res.ok) {
        const rows = await res.json();
        configured = rows?.[0]?.usage_limits ?? {};
      }
    } catch (err) {
      console.error("[usage] limits lookup failed:", err?.message || err);
    }
  }
  cacheSet("limits", configured, 60_000);
  return { ...base, ...(configured?.[plan] ?? {}) };
}

// --- metering --------------------------------------------------------------

// Calls the consume_ai_units RPC, which rolls expired windows, checks both caps
// and increments atomically. p_units = 0 is a pure pre-flight check.
//
// The call is made as the signed-in user: the function is SECURITY DEFINER and
// takes its subject from auth.uid(), so the anon key the server already holds is
// enough and no service-role secret is needed.
async function callConsume(token, units, limits) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("[usage] Supabase URL/anon key missing — limits are off");
    return null;
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/consume_ai_units`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_units: units,
      p_cap_5h: limits.five_hour,
      p_cap_week: limits.week,
    }),
  });
  if (!res.ok) throw new Error(`consume_ai_units HTTP ${res.status}`);
  return await res.json();
}

/**
 * Pre-flight. Returns { allowed, ... } — `allowed: false` means one of the two
 * windows is already exhausted and the request must not reach OpenAI.
 */
export async function checkLimit(token, plan) {
  const limits = await limitsForPlan(plan, token);
  try {
    const result = await callConsume(token, 0, limits);
    if (!result) return { allowed: true, unmetered: true };
    return { ...result, limits };
  } catch (err) {
    // A metering outage should not take chat down with it.
    console.error("[usage] pre-flight check failed:", err?.message || err);
    return { allowed: true, degraded: true, limits };
  }
}

/** Post-flight. Commits what the request actually cost. Never throws. */
export async function recordUsage(token, plan, usage) {
  const units = toUnits(usage);
  if (units <= 0) return null;
  try {
    const limits = await limitsForPlan(plan, token);
    return await callConsume(token, units, limits);
  } catch (err) {
    console.error("[usage] could not record usage:", err?.message || err);
    return null;
  }
}
