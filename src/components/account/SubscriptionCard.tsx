import { useState } from "react";
import type { AccountUser } from "@/types/account";
import type { NormalizedSummary } from "@/types/account";

import { notify } from "@/lib/notify";
import {
  startCheckout,
  renewNow,
  confirmIfRequired,
  openBillingPortal,
  type PlanCode,
} from "@/services/billing";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CARD,
  PANEL,
  BTN_ACCENT as BTN_PRIMARY,
  BTN_GHOST,
  SECTION_LABEL,
  SECONDARY,
  MUTED,
  BORDER,
} from "./ui";

type Props = {
  user: AccountUser;
  summary: NormalizedSummary | null;
  onRefresh: () => Promise<void> | void;
  onCancel: () => void;
};

export default function SubscriptionCard({
  user,
  summary,
  onRefresh,
  onCancel,
}: Props) {
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanCode | null>(null);
  const [upgradeBusy, setUpgradeBusy] = useState(false);

  const pro = summary?.pro ?? false;
  const unlimited = summary?.unlimited ?? false;
  const cancelAtPeriodEnd = summary?.cancelAtPeriodEnd ?? false;

  // ---- FIXED LOGIC ----
  const remainingServer =
    summary?.remaining ??
    Math.max(0, (user.quota.total || 0) - (user.quota.used || 0));

  let cap = summary?.cap ?? user.quota.total ?? remainingServer;

  // If remaining > cap (e.g. retention mid-cycle), bump cap up
  if (remainingServer > cap) {
    cap = remainingServer;
  }

  const remaining = remainingServer;
  const used = unlimited ? 0 : Math.max(0, cap - remaining);

  const renewalDate = summary?.renewalDate ?? user.renewalDate;

  const atCap = !unlimited && cap > 0 && used >= cap;

  const quotaPct = unlimited
    ? 100
    : Math.min(100, Math.max(0, (used / Math.max(cap, 1)) * 100));

  const planLabel = unlimited
    ? "Admin"
    : summary?.planLabel ?? (pro ? "Pro" : "Free");

  const planSubtitle = unlimited
    ? "You have unlimited searches."
    : pro
    ? `You're on the ${planLabel} plan.`
    : "Upgrade to unlock more searches and faster hiring.";

  const handleUpgradeClick = () => {
    setSelectedPlan("platinum"); // default choice
    setPlanDialogOpen(true);
  };

  const handleUpgradeConfirm = async () => {
    if (!selectedPlan) {
      notify("Please select a plan first.", "error");
      return;
    }
    try {
      setUpgradeBusy(true);
      await startCheckout(selectedPlan);
    } catch (e: any) {
      notify(e?.message || "Unable to start checkout.", "error");
    } finally {
      setUpgradeBusy(false);
    }
  };

  const handleRenewNow = async () => {
    try {
      const resp = await renewNow();
      await confirmIfRequired(resp?.client_secret);
      notify("Your cycle was reset. You now have fresh credits.", "success");
      await onRefresh();
    } catch (e: any) {
      notify(e?.message || "Could not renew now.", "error");
    }
  };

  const handleManageBilling = async () => {
    try {
      await openBillingPortal();
    } catch (e: any) {
      notify(e?.message || "Could not open billing portal.", "error");
    }
  };

  function getRenewalLabel() {
    if (!renewalDate || unlimited) return "—";
    const d = new Date(renewalDate);
    if (isNaN(d.getTime())) return `Resets on ${renewalDate}`;
    return `Resets on ${d.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    })}`;
  }

  const plans: Array<{
    code: PlanCode;
    name: string;
    searches: string;
    price: string;
    highlight?: boolean;
  }> = [
    {
      code: "platinum",
      name: "Pro",
      searches: "Unlimited",
      price: "£19.50 / month",
      highlight: true,
    },
  ];

  return (
    <section>
      <span className={SECTION_LABEL}>Subscription</span>

      <div className={`mt-5 p-6 sm:p-8 ${CARD}`}>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          {/* LEFT */}
          <div className="flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-[#1A1917] px-4 py-[6px] text-[13px] font-medium uppercase tracking-[0.04em] text-[#FF5A1F] dark:bg-[#ECEBE8] dark:text-[#E0480F]">
                {planLabel}
              </span>
              {(pro || unlimited) && (
                <span className="flex items-center gap-1.5 text-[12px] text-[#E0480F] dark:text-[#FF5A1F]">
                  <span className="h-[6px] w-[6px] rounded-full bg-[#E0480F] dark:bg-[#FF5A1F]" />
                  Active
                </span>
              )}
            </div>
            <p className={`max-w-md text-[15px] leading-[1.6] ${SECONDARY}`}>
              {planSubtitle}
            </p>
          </div>

          {/* RIGHT — quota */}
          <div className="flex-1 space-y-5 lg:max-w-md">
            <div className={`p-5 sm:p-6 ${PANEL}`}>
              <div className="flex items-center justify-between">
                <span className={`text-[11px] uppercase ${MUTED}`}>
                  Monthly quota
                </span>
                <span className="text-[13px] font-semibold text-[#1A1917] dark:text-[#ECEBE8]">
                  {unlimited ? "Unlimited ∞" : `${used} / ${cap}`}
                </span>
              </div>

              {/* Progress */}
              <div className="mt-4">
                <div className="h-[8px] overflow-hidden rounded-full bg-[rgba(26,25,23,0.1)] dark:bg-[rgba(255,255,255,0.1)]">
                  <div
                    className="h-full rounded-full bg-[#E0480F] transition-[width] duration-700 dark:bg-[#FF5A1F]"
                    style={{ width: `${quotaPct}%` }}
                  />
                </div>
                {!unlimited && quotaPct >= 90 && (
                  <p className="mt-2 text-[11px] text-[#E0480F] dark:text-[#FF5A1F]">
                    ⚠ Running low on searches
                  </p>
                )}
              </div>

              <div className={`mt-4 flex items-center justify-between border-t pt-3 ${BORDER}`}>
                <span className={`text-[11px] ${MUTED}`}>
                  {getRenewalLabel()}
                </span>
                {!unlimited && (
                  <span className="text-[11px] font-semibold text-[#1A1917] dark:text-[#ECEBE8]">
                    {remaining} left
                  </span>
                )}
              </div>
            </div>

            {/* ACTIONS */}
            <div className="flex flex-col flex-wrap gap-3 sm:flex-row">
              {!unlimited && !pro && (
                <button onClick={handleUpgradeClick} className={BTN_PRIMARY + " flex-1"}>
                  Choose a plan
                </button>
              )}

              {pro && !unlimited && (
                <button onClick={handleManageBilling} className={BTN_GHOST + " min-w-[150px]"}>
                  Manage billing
                </button>
              )}

              {pro && !unlimited && atCap && (
                <button onClick={handleRenewNow} className={BTN_PRIMARY + " flex-1"}>
                  Renew now
                </button>
              )}

              {pro && !cancelAtPeriodEnd && (
                <button
                  onClick={onCancel}
                  className={`rounded-[10px] border px-[18px] py-[10px] text-[14px] font-medium transition-colors hover:border-red-400 hover:text-red-600 ${SECONDARY} ${BORDER}`}
                >
                  Cancel
                </button>
              )}

              {pro && cancelAtPeriodEnd && (
                <div className="rounded-[10px] border border-[#E0480F]/40 bg-[#E0480F]/[0.06] px-4 py-2 text-[12px] text-[#E0480F] dark:border-[#FF5A1F]/40 dark:bg-[#FF5A1F]/[0.08] dark:text-[#FF5A1F]">
                  ⚠ Subscription ends on{" "}
                  {renewalDate
                    ? new Date(renewalDate).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })
                    : "renewal date"}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* PLAN MODAL */}
      <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[14px] border border-[rgba(26,25,23,0.1)] bg-white p-6 font-grotesk text-[#1A1917] dark:border-[rgba(255,255,255,0.1)] dark:bg-[#1F1E24] dark:text-[#ECEBE8] sm:max-w-3xl sm:p-8">
          <DialogHeader>
            <span className={SECTION_LABEL}>Upgrade your plan</span>
            <DialogTitle className="mt-2 text-[26px] font-semibold tracking-[-0.02em]">
              Choose a plan
            </DialogTitle>
            <DialogDescription className={`text-[15px] ${SECONDARY}`}>
              Choose the plan that fits your hiring volume.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            {plans.map((p) => {
              const active = selectedPlan === p.code;
              return (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => setSelectedPlan(p.code)}
                  className={
                    "relative rounded-[12px] border bg-[#F7F7F5] px-5 py-5 text-left transition-colors dark:bg-[#141317] " +
                    (active
                      ? "border-[#E0480F] ring-1 ring-[#E0480F] dark:border-[#FF5A1F] dark:ring-[#FF5A1F]"
                      : "border-[rgba(26,25,23,0.1)] hover:border-[#E0480F] dark:border-[rgba(255,255,255,0.1)] dark:hover:border-[#FF5A1F]")
                  }
                >
                  {p.highlight && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#E0480F] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.04em] text-white dark:bg-[#FF5A1F] dark:text-[#0B0B0F]">
                      Most popular
                    </span>
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="flex items-center gap-2 text-[18px] font-semibold tracking-[-0.01em]">
                        {p.name}
                        {active && <span className="text-[#E0480F] dark:text-[#FF5A1F]">✓</span>}
                      </span>
                      <div className={`mt-1.5 text-[12px] ${MUTED}`}>
                        <span className="font-semibold text-[#1A1917] dark:text-[#ECEBE8]">
                          {p.searches}
                        </span>{" "}
                        searches / month
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[20px] font-bold">
                        {p.price.split("/")[0]}
                      </div>
                      <div className={`text-[10px] ${MUTED}`}>
                        per month
                      </div>
                    </div>
                  </div>
                  <div className={`mt-3 space-y-1.5 border-t pt-3 ${BORDER}`}>
                    {["Instant activation", "Auto-renews monthly", "Cancel anytime"].map(
                      (f) => (
                        <div
                          key={f}
                          className={`flex items-center gap-2 text-[11px] ${MUTED}`}
                        >
                          <span className="text-[#E0480F] dark:text-[#FF5A1F]">›</span> {f}
                        </div>
                      )
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <DialogFooter className="mt-2 gap-3">
            <button
              onClick={() => setPlanDialogOpen(false)}
              disabled={upgradeBusy}
              className={BTN_GHOST + " w-full sm:w-auto"}
            >
              Close
            </button>
            <button
              onClick={handleUpgradeConfirm}
              disabled={upgradeBusy || !selectedPlan}
              className={BTN_PRIMARY + " w-full sm:w-auto"}
            >
              {upgradeBusy ? "Processing..." : "Continue to checkout"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
