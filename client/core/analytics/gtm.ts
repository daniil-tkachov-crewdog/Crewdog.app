// Helpers to send events safely. Use after consent is granted.
import { gtag } from "@/core/analytics/consent";

export function gaEvent(name: string, params?: Record<string, any>) {
  // Old site used dataLayer.push({event:'run_search', ...});
  // With gtag wrapper: send as 'event' still
  (window as any).dataLayer = (window as any).dataLayer || [];
  (window as any).dataLayer.push({ event: name, ...(params || {}) });
}

export function gaPageview(path: string, title?: string) {
  gaEvent("page_view", {
    page_path: path,
    page_title: title || document.title,
  });
}
