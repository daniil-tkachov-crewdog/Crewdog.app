import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Topbar } from "@/components/layout/Topbar";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import { gaEvent } from "@/analytics/gtm";
import { useAuth } from "@/auth/AuthProvider";
import {
  startCheckout,
  openBillingPortal,
  type PlanCode,
} from "@/services/billing";
import {
  fetchAccountSummary,
  type NormalizedSummary,
} from "@/services/account";
import { toast } from "sonner";

const plans = [
  {
    name: "Free",
    monthlyPrice: "£0",
    annualPrice: "£0",
    period: "forever",
    description: "",
    highlight: "Best for exploring",
    features: [
      "3 searches per month",
      "Basic company information",
      "Email support",
      "Search history (30 days)",
    ],
    cta: "Get Started",
    disabled: false,
  },
  {
    name: "Pro",
    monthlyPrice: "£19.50",
    annualPrice: "£234",
    period: "per month",
    description: "",
    highlight: "For serious hiring",
    features: [
      "Unlimited searches",
      "Full company intelligence",
      "Priority email support",
      "Contact recommendations",
      "Search history (1 year)",
      "Export results (CSV & XLSX)",
      "Advanced & saved filters",
    ],
    cta: "Choose Pro",
    popular: true,
  },
];

export default function Pricing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [summary, setSummary] = useState<NormalizedSummary | null>(null);

  useEffect(() => {
    (window as any).dataLayer = (window as any).dataLayer || [];
    (window as any).dataLayer.push({ event: "pricing_page_view" });
    try {
      gaEvent("pricing_page_view");
    } catch {}
  }, []);

  // Fetch user summary when logged in
  useEffect(() => {
    if (user) {
      fetchAccountSummary()
        .then(setSummary)
        .catch(() => {
          /* ignore */
        });
    }
  }, [user]);

  async function handlePlanClick(planName: string, isPaid: boolean) {
    const billing = "monthly";
    const price = plans.find((p) => p.name === planName);
    const amount = price?.monthlyPrice;

    const payload = { plan: planName, billing, amount };

    (window as any).dataLayer.push({ event: "select_plan_click", ...payload });
    try {
      gaEvent("select_plan_click", payload);
    } catch {}

    // If user is not logged in, redirect to login
    if (!user) {
      navigate("/login?from=/pricing");
      return;
    }

    // If user already has an active paid plan, redirect to billing portal
    if (summary?.pro && !summary?.unlimited) {
      toast.info(
        "You already have an active plan. Manage your subscription in the billing portal."
      );
      try {
        await openBillingPortal();
      } catch (e: any) {
        toast.error(e?.message || "Unable to open billing portal.");
      }
      return;
    }

    // If it's the free plan, redirect to dashboard
    if (!isPaid) {
      navigate("/run");
      return;
    }

    // For paid plans, go direct to checkout
    if (isPaid) {
      (window as any).dataLayer.push({ event: "checkout_start", ...payload });
      try {
        gaEvent("checkout_start", payload);
      } catch {}

      // Map plan names to plan codes. The single paid plan reuses the
      // "platinum" checkout code, which the Stripe backend maps to the
      // £19.50 price.
      const planCodeMap: Record<string, PlanCode> = {
        Pro: "platinum",
      };

      const planCode = planCodeMap[planName];
      if (planCode) {
        try {
          await startCheckout(planCode);
        } catch (e: any) {
          toast.error(e?.message || "Unable to start checkout.");
        }
      }
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F2EE] text-[#0B0B0F] font-['Space_Grotesk',system-ui,sans-serif]">
      <Topbar />

      {/* ── Hero ── */}
      <header className="relative overflow-hidden bg-[#0B0B0F] text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 -top-20 h-[520px] w-[520px] rounded-full border border-[#FF5A1F]/20 max-[720px]:right-[-220px] max-[720px]:opacity-50"
        >
          <div className="absolute inset-20 rounded-full border border-[#FF5A1F]/[0.14]" />
          <div className="absolute inset-[170px] rounded-full border border-[#FF5A1F]/10" />
        </div>

        <div className="mx-auto w-full max-w-[1040px] px-6 py-[72px] pb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="mb-7 block font-['IBM_Plex_Mono',monospace] text-[13px] uppercase tracking-[0.22em] text-[#FF5A1F]">
              Pricing · No setup fees · Cancel anytime
            </span>
            <h1 className="max-w-[18ch] text-[clamp(38px,7vw,68px)] font-bold leading-[1.0] tracking-[-0.03em]">
              Choose the plan that matches your{" "}
              <em className="not-italic text-[#FF5A1F]">search volume.</em>
            </h1>

            {/* Current plan info (logged-in) */}
            {user && summary && (
              <div className="mt-9 inline-flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-[#FF5A1F]/30 bg-white/[0.04] px-5 py-4">
                <span className="font-['IBM_Plex_Mono',monospace] text-[11px] uppercase tracking-[0.16em] text-[#6F6C78]">
                  Your plan
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-[18px] font-semibold text-[#FF5A1F]">
                    {summary.planLabel || (summary.pro ? "Pro" : "Free")}
                  </span>
                  {(summary.pro || summary.unlimited) && (
                    <span className="font-['IBM_Plex_Mono',monospace] text-[11px] uppercase tracking-[0.06em] text-[#FF5A1F]">
                      ✓ Active
                    </span>
                  )}
                </span>
                {!summary.unlimited && summary.remaining !== null && (
                  <span className="font-['IBM_Plex_Mono',monospace] text-[12px] tracking-[0.04em] text-[#C9C6CF]">
                    {summary.remaining} searches left
                    {summary.cap ? ` of ${summary.cap}` : ""}
                  </span>
                )}
                {summary.unlimited && (
                  <span className="font-['IBM_Plex_Mono',monospace] text-[12px] tracking-[0.04em] text-[#C9C6CF]">
                    ∞ Unlimited searches
                  </span>
                )}
              </div>
            )}
          </motion.div>
        </div>
      </header>

      {/* ── Plans ── */}
      <main className="flex-1 py-16">
        <div className="mx-auto w-full max-w-[1100px] px-6">
          <div className="mx-auto grid max-w-[720px] grid-cols-1 items-stretch gap-5 sm:grid-cols-2">
            {plans.map((plan, i) => {
              const price = plan.monthlyPrice;
              const isPaid = plan.name !== "Free";
              const popular = !!plan.popular;

              return (
                <motion.div
                  key={plan.name}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ delay: i * 0.06, duration: 0.4 }}
                  className={
                    "relative flex h-full flex-col rounded-md border bg-white p-6 " +
                    (popular ? "border-[#FF5A1F] ring-1 ring-[#FF5A1F]" : "border-[#E4E1D9]")
                  }
                >
                  {popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[2px] bg-[#FF5A1F] px-3 py-1 font-['IBM_Plex_Mono',monospace] text-[10px] font-bold uppercase tracking-[0.06em] text-[#0B0B0F]">
                      Most popular
                    </span>
                  )}

                  {/* Highlight */}
                  {plan.highlight && (
                    <span className="font-['IBM_Plex_Mono',monospace] text-[11px] uppercase tracking-[0.1em] text-[#6F6C78]">
                      {plan.highlight}
                    </span>
                  )}

                  {/* Name */}
                  <h3 className="mt-2 text-[22px] font-semibold tracking-[-0.02em]">
                    {plan.name}
                  </h3>

                  {/* Price */}
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="font-['IBM_Plex_Mono',monospace] text-[34px] font-bold tracking-[-0.02em] text-[#0B0B0F]">
                      {price}
                    </span>
                    <span className="font-['IBM_Plex_Mono',monospace] text-[12px] text-[#6F6C78]">
                      /{plan.period}
                    </span>
                  </div>

                  <div className="my-5 h-px w-full bg-[#E4E1D9]" />

                  {/* Features */}
                  <ul className="mb-6 flex-1 space-y-2.5">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2.5">
                        <span className="mt-[1px] flex-shrink-0 font-['IBM_Plex_Mono',monospace] text-[#FF5A1F]">
                          ›
                        </span>
                        <span className="text-[13px] leading-snug text-[#55525E]">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <div className="mt-auto">
                    {summary?.pro && !summary?.unlimited && isPaid ? (
                      <button
                        onClick={() => handlePlanClick(plan.name, isPaid)}
                        className={
                          "w-full rounded-[2px] px-4 py-[12px] text-[14px] font-semibold transition-transform hover:-translate-y-0.5 " +
                          (summary.planLabel === plan.name
                            ? "bg-[#FF5A1F] text-[#0B0B0F]"
                            : "border border-[#E4E1D9] hover:border-[#FF5A1F]")
                        }
                      >
                        {summary.planLabel === plan.name
                          ? "Current plan ✓"
                          : "Manage billing"}
                      </button>
                    ) : (
                      <button
                        disabled={plan.disabled}
                        onClick={() => handlePlanClick(plan.name, isPaid)}
                        className={
                          "w-full rounded-[2px] px-4 py-[12px] text-[14px] font-semibold transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 " +
                          (plan.name === "Free"
                            ? "border border-[#E4E1D9] hover:border-[#FF5A1F]"
                            : "bg-[#FF5A1F] text-[#0B0B0F]")
                        }
                      >
                        {plan.cta}
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
