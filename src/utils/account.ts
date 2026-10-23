// src/utils/account.ts
//
// An earlier, simpler normalizeSummary(). Nothing imports it.
//
// The version the app runs is the one in src/services/account.ts, which this
// predates: that one also infers the plan from its Stripe price, treats admins
// as unlimited and reads the cap from four more places. Keep changes going
// there, not here.
//
// Left in place for now because removing it was not part of the agreed
// restructure scope; docs/RESTRUCTURE.md §4.2 folds it into the account
// feature. Its import of @/constants/account had been dangling — that file
// did not exist — so this module could not have compiled if anything had
// tried to use it.

import { FREE_CAP, PRO_CAP } from "@/constants/account";
import type { SummaryRaw, NormalizedSummary } from "@/types/account";

export function num(v: any, d = 0) {
  const n = typeof v === "string" ? Number(v.trim()) : Number(v);
  return Number.isFinite(n) ? n : d;
}

export function normalizeSummary(s?: SummaryRaw): NormalizedSummary {
  const unlimited =
    s?.unlimited === true ||
    s?.isAdmin === true ||
    s?.creditsRemaining === null;

  const status = s?.status || "none";
  const pro = ["active", "trialing", "past_due"].includes(status);

  const cap = num(s?.searchCap, num(s?.cap, pro ? PRO_CAP : FREE_CAP));
  const used = num(s?.used, 0);
  const remaining = unlimited ? null : Math.max(0, cap - used);

  return {
    status,
    pro,
    cap,
    used,
    remaining,
    renewalDate: s?.renewalDate ?? null,
    unlimited,
    // Required by NormalizedSummary and previously omitted — an error this
    // file never reported, because its dangling @/constants/account import
    // stopped tsc before it got this far. Read the same way the live
    // services/account.ts reads it.
    isAdmin: s?.isAdmin === true,
    // SummaryRaw.price marks every field optional (the API may send a partial
    // price object); NormalizedSummary.price does not. Nothing downstream
    // reads this value — see the note at the top of this file — so it is
    // passed through rather than given a defaulting branch it would not earn.
    price: s?.price as NormalizedSummary["price"],
    cancelAtPeriodEnd: !!s?.cancelAtPeriodEnd,
  };
}
