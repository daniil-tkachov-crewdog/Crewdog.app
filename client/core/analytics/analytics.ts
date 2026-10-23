// client/core/analytics/analytics.ts
//
// Pushes an event onto the GTM dataLayer.
//
// The array is created if GTM has not loaded yet: GTM drains whatever it
// finds when it does load, so an event raised early is queued rather than
// lost, and a blocked or absent GTM degrades to filling an array nobody
// reads.

export function pushEvent(payload: Record<string, any>) {
  // GTM/GA safe-call
  (window as any).dataLayer = (window as any).dataLayer || [];
  (window as any).dataLayer.push(payload);
}
