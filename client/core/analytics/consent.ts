// GA4 Consent Mode + Banner controller (React-friendly, no CSS opinions)
// Mirrors old consent.js defaults: deny by default; load GTM only after accept.

const KEY = "gc-consent-v1";

export type ConsentChoice = {
  ad_storage: "granted" | "denied";
  analytics_storage: "granted" | "denied";
  ad_user_data: "granted" | "denied";
  ad_personalization: "granted" | "denied";
};

function getGtmId() {
  return (
    (window as any).__GTM_ID ||
    (import.meta as any).env?.VITE_GTM_ID ||
    "GTM-NV2DBM3P"
  );
}

function ensureDataLayer() {
  (window as any).dataLayer = (window as any).dataLayer || [];
  return (window as any).dataLayer;
}

export function gtag(...args: any[]) {
  ensureDataLayer().push(args);
}

export function setDefaultConsent() {
  // default: denied (like old site)
  gtag("consent", "default", {
    ad_storage: "denied",
    analytics_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    wait_for_update: 500,
  });
  gtag("set", "ads_data_redaction", true);
}

export function loadGtmIfNeeded() {
  const id = getGtmId();
  if (!id) return;
  if (document.getElementById("gc-gtm")) return;
  const s = document.createElement("script");
  s.id = "gc-gtm";
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(
    id
  )}`;
  document.head.appendChild(s);
}

export function saveConsent(choice: ConsentChoice) {
  try {
    localStorage.setItem(KEY, JSON.stringify(choice));
  } catch {}
}

export function readConsent(): ConsentChoice | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ConsentChoice) : null;
  } catch {
    return null;
  }
}

export function applyConsent(choice: ConsentChoice) {
  gtag("consent", "update", choice);
}

export function grantAll() {
  const c: ConsentChoice = {
    ad_storage: "granted",
    analytics_storage: "granted",
    ad_user_data: "granted",
    ad_personalization: "granted",
  };
  saveConsent(c);
  applyConsent(c);
  loadGtmIfNeeded();
}

export function denyAll() {
  const c: ConsentChoice = {
    ad_storage: "denied",
    analytics_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  };
  saveConsent(c);
  applyConsent(c);
}

export function setupConsentOnBoot() {
  setDefaultConsent();

  const saved = readConsent();
  if (saved) {
    applyConsent(saved);
    if (saved.analytics_storage === "granted") {
      loadGtmIfNeeded();
    }
  }
}
