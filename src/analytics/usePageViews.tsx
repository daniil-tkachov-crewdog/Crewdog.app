import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { gaPageview } from "./gtm";
import { readConsent } from "./consent";

// Reports an in-app navigation to our own traffic log (the admin "Web Traffic"
// tab). Deliberately not behind the GA consent gate: this is first-party
// server-side logging with a truncated IP, not a third-party advertising
// cookie, so it follows the same rules as a web server's access log.
//
// The server logs the initial document request itself, so only route changes
// after the first render are sent here — otherwise the landing page would count
// twice. Admin pages are skipped so browsing the log does not fill the log.
function trackPageView(path: string, referrer: string) {
  if (/^\/admin(\/|$)/i.test(path)) return;

  const body = JSON.stringify({ path, referrer });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
      return;
    }
  } catch {
    // sendBeacon can throw on a blocked origin; fall through to fetch.
  }
  // keepalive lets the request outlive the page if the visitor navigates away.
  void fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    /* tracking is best-effort — never surface a failure to the visitor */
  });
}

export default function usePageViews() {
  const loc = useLocation();
  const previousPath = useRef<string | null>(null);

  useEffect(() => {
    const path = loc.pathname + loc.search;

    const consent = readConsent();
    if (consent?.analytics_storage === "granted") {
      gaPageview(path);
    }

    // Skip the first render: the server already logged that page load.
    if (previousPath.current !== null) {
      trackPageView(path, previousPath.current);
    }
    previousPath.current = path;
  }, [loc]);
}
