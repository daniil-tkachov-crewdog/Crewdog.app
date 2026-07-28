// src/lib/config.ts
import { env } from "@/lib/env";

const isBrowser = typeof window !== "undefined";
const isLocalHost =
  isBrowser &&
  ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

// Optional override for debugging via <script> window.__API_BASE__ = "https://...";
const windowApiBase = (() => {
  if (!isBrowser) return "";
  const v = (window as any).__API_BASE__?.trim?.() || "";
  try {
    if (!v) return "";
    // allow absolute https/http URLs
    if (v.startsWith("http://") || v.startsWith("https://")) return v;
    // allow same-origin path (e.g., "/api") only in local dev
    if (v.startsWith("/") && isLocalHost) return v;
    return "";
  } catch {
    return "";
  }
})();

// Normalize: remove trailing slash
function normalizeBase(u: string) {
  if (!u) return u;
  return u.endsWith("/") ? u.slice(0, -1) : u;
}

// In prod, prefer https (warn if someone sets http for a public host)
function ensureHttpsInProd(url: string) {
  try {
    if (!url) return url;
    const u = new URL(url);
    // localhost is fine in dev; anything else should be https
    if (!isLocalHost && u.hostname !== "localhost" && u.protocol !== "https:") {
      // eslint-disable-next-line no-console
      console.warn(
        "[config] For production, a public URL should use HTTPS:",
        url
      );
    }
  } catch {
    // ignore parse errors; other guards will catch missing base
  }
  return url;
}

/**
 * Resolution order:
 * 1) env.VITE_API_BASE (always wins in prod; set this on Render)
 * 2) window.__API_BASE__ (manual override for debugging)
 * 3) local dev default: http://localhost:3000/api
 *
 * We deliberately DO NOT fall back to "/api" in prod,
 * because the frontend is a static site (no proxy).
 */
const resolvedApiBase =
  env.VITE_API_BASE?.trim() ||
  windowApiBase ||
  (isLocalHost ? "http://localhost:3000/api" : "");

if (!resolvedApiBase && isBrowser && !isLocalHost) {
  // Helpful runtime hint if someone forgot to set VITE_API_BASE in prod
  // eslint-disable-next-line no-console
  console.warn(
    "[config] VITE_API_BASE is not set; API calls will fail on static hosting."
  );
}

export const API_BASE = ensureHttpsInProd(normalizeBase(resolvedApiBase));

// Stripe
export const STRIPE_PUBLISHABLE_KEY = env.VITE_STRIPE_PUBLISHABLE_KEY;

// ---- N8N webhooks (JSON endpoints) ----
const rawSupport =
  env.VITE_N8N_SUPPORT_WEBHOOK?.trim?.() ||
  "https://crewdog.app.n8n.cloud/webhook/support";
export const N8N_SUPPORT_WEBHOOK = ensureHttpsInProd(normalizeBase(rawSupport));

const rawCvWebhook =
  env.VITE_N8N_CV_WEBHOOK?.trim?.() ||
  "https://crewdog.app.n8n.cloud/webhook/eb31b6d7-7bac-4ed0-a177-6676898d3ec8";
export const N8N_CV_WEBHOOK = ensureHttpsInProd(normalizeBase(rawCvWebhook));

const rawContactDetails =
  env.VITE_N8N_CONTACT_DETAILS_WEBHOOK?.trim?.() ||
  "https://crewdog.app.n8n.cloud/webhook/40ce659f-83c8-4a59-9e9a-983fb424feee";
export const N8N_CONTACT_DETAILS_WEBHOOK = ensureHttpsInProd(
  normalizeBase(rawContactDetails)
);

// Prod guardrails: flag obvious misconfig early (console only)
const IS_PROD_LIKE = isBrowser && !isLocalHost;

// Wrong publishable key in prod (should be pk_live_)
if (
  IS_PROD_LIKE &&
  STRIPE_PUBLISHABLE_KEY &&
  !STRIPE_PUBLISHABLE_KEY.startsWith("pk_live_")
) {
  // eslint-disable-next-line no-console
  console.error(
    "[stripe] Production build must use a pk_live_ publishable key."
  );
}

// Missing API base in prod
if (IS_PROD_LIKE && !API_BASE) {
  // eslint-disable-next-line no-console
  console.error("[config] Missing VITE_API_BASE in production.");
}

/** Helper to build URLs without duplicate slashes */
export function apiUrl(path: string) {
  const base = API_BASE || "";
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

/** Nice-to-have: surface when the app is likely running in test mode */
export function isLikelyTestMode() {
  return (
    STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_") ||
    API_BASE?.includes("localhost") ||
    API_BASE?.includes("staging")
  );
}
