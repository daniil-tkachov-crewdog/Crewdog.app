// client/components/layout/ConsentBanner.tsx
//
// The cookie banner. Shown only until a choice is stored, and the choice is
// what gates Google Analytics (see core/analytics/consent).
//
// Our own page-view logging is deliberately not behind this: it is
// first-party, server-side and IP-truncated, which is an access log rather
// than tracking.

import { useEffect, useState } from "react";
import { grantAll, denyAll, readConsent } from "@/core/analytics/consent";

export default function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const saved = readConsent();
    setVisible(!saved);
  }, []);

  if (!visible) return null;

  return (
    <div
      id="gc-consent"
      className="
        fixed left-0 right-0 bottom-0 z-[9999] backdrop-blur-md
        bg-white text-gray-900 border-t border-gray-200
        dark:bg-[#12161c] dark:text-[#e6eaf2] dark:border-[#1f2937]
      "
    >
      <div className="mx-auto max-w-5xl flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
        <div className="min-w-[220px]">
          We use Google Analytics only if you consent. You can change this later
          in Privacy.
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => {
              grantAll();
              setVisible(false);
            }}
            className="
              px-3 py-2 rounded-lg text-white
              bg-blue-600 border border-blue-600
              hover:bg-blue-700 hover:border-blue-700
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
              dark:ring-offset-[#12161c]
            "
          >
            Accept
          </button>

          <button
            onClick={() => {
              denyAll();
              setVisible(false);
            }}
            className="
              px-3 py-2 rounded-lg
              border border-gray-300 text-gray-800
              hover:bg-gray-50
              dark:border-[#1f2937] dark:text-[#e6eaf2] dark:hover:bg-white/5
              focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2
              dark:focus:ring-white/30 dark:ring-offset-[#12161c]
            "
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
