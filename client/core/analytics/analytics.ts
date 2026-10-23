export function pushEvent(payload: Record<string, any>) {
  // GTM/GA safe-call
  (window as any).dataLayer = (window as any).dataLayer || [];
  (window as any).dataLayer.push(payload);
}
