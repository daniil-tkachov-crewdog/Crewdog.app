import { createRoot } from "react-dom/client";
import App from "@/App";
import "@/styles/index.css";

import { setupConsentOnBoot } from "@/core/analytics/consent";
setupConsentOnBoot();

createRoot(document.getElementById("root")!).render(<App />);
