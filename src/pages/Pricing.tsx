import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Wordmark, ThemeToggle } from "@/components/layout/chrome";
import {
  CARD,
  BTN_ACCENT,
  BTN_GHOST,
  SECTION_LABEL,
  SECONDARY,
  MUTED,
} from "@/components/account/ui";
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
    <div className="flex min-h-screen flex-col bg-white font-grotesk text-[#1A1917] dark:bg-[#17161A] dark:text-[#ECEBE8]">
      <header className="flex h-14 shrink-0 items-center justify-between px-6">
        <Link to="/chat">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-[6px] text-[13px] text-[#6E6B64] transition-colors hover:text-[#1A1917] dark:text-[#96938C] dark:hover:text-[#ECEBE8]"
          >
            <ArrowLeft className="h-[15px] w-[15px]" />
            Back
          </button>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 pb-16 pt-6">
        <div className="mx-auto w-full max-w-[1040px] px-6">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-10 text-center"
          >
            <span className={SECTION_LABEL}>Pricing · Cancel anytime</span>
            <h1 className="mx-auto mt-3 max-w-[20ch] text-[clamp(32px,5vw,44px)] font-semibold leading-[1.05] tracking-[-0.03em]">
              Simple pricing that scales with you
            </h1>

            {/* Current plan info (logged-in) */}
            {user && summary && (
              <div className={`mx-auto mt-6 inline-flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-5 py-3 ${CARD}`}>
                <span className={`text-[11px] uppercase tracking-[0.06em] ${MUTED}`}>
                  Your plan
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-[16px] font-semibold text-[#E0480F] dark:text-[#FF5A1F]">
                    {summary.planLabel || (summary.pro ? "Pro" : "Free")}
                  </span>
                  {(summary.pro || summary.unlimited) && (
                    <span className="text-[11px] uppercase tracking-[0.04em] text-[#E0480F] dark:text-[#FF5A1F]">
                      ✓ Active
                    </span>
                  )}
                </span>
                {!summary.unlimited && summary.remaining !== null && (
                  <span className={`text-[12px] ${SECONDARY}`}>
                    {summary.remaining} searches left
                    {summary.cap ? ` of ${summary.cap}` : ""}
                  </span>
                )}
                {summary.unlimited && (
                  <span className={`text-[12px] ${SECONDARY}`}>
                    ∞ Unlimited searches
                  </span>
                )}
              </div>
            )}
          </motion.div>

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
                    "relative flex h-full flex-col p-6 " +
                    CARD +
                    (popular
                      ? " border-[#E0480F] ring-1 ring-[#E0480F] dark:border-[#FF5A1F] dark:ring-[#FF5A1F]"
                      : "")
                  }
                >
                  {popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#E0480F] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.04em] text-white dark:bg-[#FF5A1F] dark:text-[#0B0B0F]">
                      Most popular
                    </span>
                  )}

                  {/* Highlight */}
                  {plan.highlight && (
                    <span className={`text-[11px] uppercase tracking-[0.06em] ${MUTED}`}>
                      {plan.highlight}
                    </span>
                  )}

                  {/* Name */}
                  <h3 className="mt-2 text-[22px] font-semibold tracking-[-0.02em]">
                    {plan.name}
                  </h3>

                  {/* Price */}
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-[34px] font-bold tracking-[-0.02em] text-[#1A1917] dark:text-[#ECEBE8]">
                      {price}
                    </span>
                    <span className={`text-[12px] ${MUTED}`}>/{plan.period}</span>
                  </div>

                  <div className="my-5 h-px w-full bg-[rgba(26,25,23,0.1)] dark:bg-[rgba(255,255,255,0.1)]" />

                  {/* Features */}
                  <ul className="mb-6 flex-1 space-y-2.5">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2.5">
                        <span className="mt-[1px] flex-shrink-0 text-[#E0480F] dark:text-[#FF5A1F]">
                          ›
                        </span>
                        <span className={`text-[13px] leading-snug ${SECONDARY}`}>
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
                          summary.planLabel === plan.name
                            ? `w-full ${BTN_ACCENT}`
                            : `w-full ${BTN_GHOST}`
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
                          "w-full " +
                          (plan.name === "Free" ? BTN_GHOST : BTN_ACCENT)
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
    </div>
  );
}
