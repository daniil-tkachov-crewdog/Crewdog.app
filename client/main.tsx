// client/main.tsx
//
// Browser entrypoint. Consent is restored before React mounts so the first
// render already knows whether analytics may run — doing it inside a
// component would leave a window where a page view fires unconsented.

import { createRoot } from "react-dom/client";
import App from "@/App";
import "@/styles/index.css";

import { setupConsentOnBoot } from "@/core/analytics/consent";
setupConsentOnBoot();

createRoot(document.getElementById("root")!).render(<App />);
