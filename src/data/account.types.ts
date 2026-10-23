// src/data/account.types.ts
//
// Shapes for the placeholder data in account.mock.ts and the two components
// that render it (AchievementsGrid, ActivityLog). These are presentation
// fixtures, not API responses — the live account data is typed in
// src/types/account.ts and fetched through src/services/account.ts.
//
// This file previously did not exist. Three modules imported it, and all three
// used `import type`, which esbuild erases before resolution — so the bundle
// built fine while `tsc` failed and every one of these types silently widened
// to `any`. Writing it out restores the checking those imports were asking for.

import type { LucideIcon } from "lucide-react";
import type { AccountUser as ApiAccountUser } from "@/types/account";

/**
 * The user object `makeUser()` hands to the account page.
 *
 * It is passed straight to AccountHeader, ProfileInfo and SubscriptionCard,
 * which are typed against the canonical `AccountUser`, so this has to stay
 * assignable to it. The extra fields below are display-only copy that the
 * canonical type has no reason to carry.
 */
export type AccountUser = ApiAccountUser & {
  /** Stripe-style status string shown next to the plan name. */
  subscriptionStatus?: string;
  /** Human-readable join date, e.g. "January 2024". Never parsed. */
  memberSince?: string;
  /** Lifetime search count shown as a headline figure. */
  totalSearches?: number;
  /** Percentage, 0–100, shown as a headline figure. */
  successRate?: number;
};

/**
 * One badge in AchievementsGrid. `icon` is the lucide component itself, not a
 * name, because the grid renders it directly as `<a.icon />`.
 */
export type Achievement = {
  icon: LucideIcon;
  name: string;
  description: string;
  /** Unlocked badges render highlighted; locked ones render dimmed. */
  unlocked: boolean;
};

/**
 * One row in ActivityLog. `time` is pre-formatted relative text ("2 hours
 * ago") rather than a timestamp — nothing re-computes it on render.
 */
export type ActivityItem = {
  action: string;
  time: string;
  icon: LucideIcon;
};

/**
 * One row of search history in the fixtures. The live equivalent is
 * `SearchRow` in src/types/account.ts, which this deliberately does not
 * reuse: the fixture is a flat summary, not the full record.
 */
export type SearchItem = {
  id: number;
  /** ISO date, e.g. "2025-01-15". */
  date: string;
  company: string;
  status: "completed" | "failed" | "running" | string;
  /** How many contacts the search returned. */
  results: number;
  /** Pre-formatted duration, e.g. "2.3s". */
  duration: string;
};
