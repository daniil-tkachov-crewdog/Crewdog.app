// Web traffic capture — one row per page view, read by the admin "Web Traffic" tab.
//
// Privacy
// -------
// The raw IP never leaves this module. It is used in memory to look up a
// city/country and to derive a visitor hash, then thrown away; what reaches the
// database is a truncated network prefix ("81.2.69.x"). `visitor_id` is a
// one-way hash of (date + ip + user-agent), so it groups one person's views
// within a UTC day and stops being linkable the next day.
//
// Geo
// ---
// geoip-lite carries an embedded MaxMind-lite database, so lookups are local:
// no API key, no rate limit, no network call on the request path. Country is
// reliable, city is approximate — good enough for "where is my traffic from",
// not for anything that needs to be exact.
//
// Failure policy
// --------------
// Tracking must never break page serving. Every entry point swallows its own
// errors and returns; callers are expected to fire and forget.

import crypto from "node:crypto";
import geoip from "geoip-lite";
import { UAParser } from "ua-parser-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Salts the daily visitor hash so the stored id cannot be reversed back to an
// IP by anyone who reads the table. Any stable server-side secret will do; the
// service-role key is already required here, so it doubles as the default.
const VISITOR_SALT =
  process.env.TRAFFIC_VISITOR_SALT || SERVICE_ROLE_KEY || "crewdog-traffic";

// Probability that a given insert also triggers the 90-day purge. pg_cron is
// not enabled on this project, so retention rides along with normal traffic:
// at even a trickle of views this fires several times a day, and the delete is
// a no-op index scan whenever there is nothing old enough to remove.
const PURGE_CHANCE = 1 / 500;

const enabled = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);
if (!enabled) {
  console.warn(
    "[traffic] SUPABASE_SERVICE_ROLE_KEY or Supabase URL missing — web traffic logging is off"
  );
}

// Requests that are not page views: built assets, source maps, icons, the API
// itself. Without this every page load would also log a dozen .js/.css rows.
const ASSET_RE =
  /\.(js|mjs|css|map|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|eot|txt|xml|json|pdf|webmanifest)$/i;
const SKIP_PREFIX_RE = /^\/(api|assets|static)(\/|$)/i;

// Admin browsing shouldn't pollute the log it is looking at.
const ADMIN_RE = /^\/admin(\/|$)/i;

const BOT_RE =
  /bot|crawl|spider|slurp|scrape|curl|wget|python-requests|axios|node-fetch|headless|phantomjs|puppeteer|playwright|lighthouse|monitor|uptime|pingdom|semrush|ahrefs|mj12|dotbot|bingpreview|facebookexternalhit|whatsapp|telegram|discord|slackbot|embedly|preview|validator|feedfetcher|gtmetrix|pagespeed/i;

export function isTrackablePath(path) {
  if (!path || !path.startsWith("/")) return false;
  if (SKIP_PREFIX_RE.test(path)) return false;
  if (ADMIN_RE.test(path)) return false;
  if (ASSET_RE.test(path.split("?")[0])) return false;
  return true;
}

// Render terminates TLS at its proxy, so the real client address is the first
// entry of x-forwarded-for. Express's req.ip gives the same value once
// `trust proxy` is set, but reading the header directly keeps this module
// usable from anywhere and avoids depending on that setting being right.
export function clientIp(req) {
  const fwd = req.headers?.["x-forwarded-for"];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd || "").split(",")[0].trim();
  const raw = first || req.ip || req.socket?.remoteAddress || "";
  // Node reports IPv4 over a dual-stack socket as "::ffff:81.2.69.142".
  return raw.replace(/^::ffff:/i, "");
}

// IPv4 keeps three octets, IPv6 keeps the /48. Enough to separate two visitors
// and to recognise an abusive network; not enough to be a personal identifier.
export function truncateIp(ip) {
  if (!ip) return null;
  if (ip.includes(".") && !ip.includes(":")) {
    const parts = ip.split(".");
    if (parts.length !== 4) return null;
    return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
  }
  if (ip.includes(":")) {
    const groups = ip.split(":").filter(Boolean).slice(0, 3);
    if (!groups.length) return null;
    return `${groups.join(":")}:x`;
  }
  return null;
}

function visitorId(ip, ua) {
  const day = new Date().toISOString().slice(0, 10); // rotates at UTC midnight
  return crypto
    .createHash("sha256")
    .update(`${day}|${ip}|${ua}|${VISITOR_SALT}`)
    .digest("hex")
    .slice(0, 16);
}

function parseAgent(ua) {
  if (!ua) return { browser: null, os: null, deviceType: "unknown", isBot: true };

  const { browser, os, device } = new UAParser(ua).getResult();
  const isBot = BOT_RE.test(ua);

  // ua-parser-js only sets device.type for non-desktops, so an absent type on a
  // real browser means desktop.
  const deviceType = isBot ? "bot" : device.type || "desktop";

  return {
    browser: browser.name
      ? [browser.name, browser.version?.split(".")[0]].filter(Boolean).join(" ")
      : null,
    os: os.name ? [os.name, os.version].filter(Boolean).join(" ") : null,
    deviceType,
    isBot,
  };
}

// Keeps a referrer readable in the table: our own pages are noise, so they
// collapse to null and only genuine inbound sources survive.
function normaliseReferrer(referrer, req) {
  const value = (referrer || "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = req.headers?.host || "";
    if (url.hostname === host.split(":")[0]) return null;
    if (/(^|\.)crewdog\.app$/i.test(url.hostname)) return null;
    return value.slice(0, 500);
  } catch {
    return value.slice(0, 500);
  }
}

async function insert(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/app_page_views`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    throw new Error(`app_page_views HTTP ${res.status}: ${await res.text()}`);
  }
}

async function maybePurge() {
  if (Math.random() >= PURGE_CHANCE) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/purge_old_page_views`, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
  } catch (err) {
    console.error("[traffic] purge failed:", err?.message || err);
  }
}

/**
 * Records one page view. Fire and forget — never await this on a request path
 * and never let it reject: a tracking outage must not cost a page render.
 *
 * Everything that identifies the visitor (IP, user agent) is read from the
 * request itself, never from the caller's body, so the /api/track endpoint
 * cannot be used to forge a location or impersonate another visitor.
 */
export function recordPageView(req, { path, referrer, userId } = {}) {
  if (!enabled) return;

  try {
    const cleanPath = String(path || "").split("#")[0].slice(0, 500);
    if (!isTrackablePath(cleanPath)) return;

    const ip = clientIp(req);
    const ua = String(req.headers?.["user-agent"] || "").slice(0, 500);
    const agent = parseAgent(ua);
    const geo = ip ? geoip.lookup(ip) : null;

    const row = {
      visitor_id: visitorId(ip, ua),
      user_id: userId || null,
      path: cleanPath,
      referrer: normaliseReferrer(referrer, req),
      ip_prefix: truncateIp(ip),
      country: geo?.country || null,
      region: geo?.region || null,
      city: geo?.city || null,
      device_type: agent.deviceType,
      browser: agent.browser,
      os: agent.os,
      user_agent: ua || null,
      is_bot: agent.isBot,
    };

    insert(row)
      .then(maybePurge)
      .catch((err) => console.error("[traffic] insert failed:", err?.message || err));
  } catch (err) {
    console.error("[traffic] capture failed:", err?.message || err);
  }
}
