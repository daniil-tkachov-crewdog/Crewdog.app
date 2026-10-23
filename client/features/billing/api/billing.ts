// src/services/billing.ts
import { API_BASE, STRIPE_PUBLISHABLE_KEY } from "@/core/config/config";
import { getIdentity } from "@/core/supabase/client";
import { loadStripe } from "@stripe/stripe-js";

if (!API_BASE) {
  // Surface a loud error early (prod will log this in console)
  // eslint-disable-next-line no-console
  console.error("[billing] API_BASE is not set; requests will fail.");
}

const base = (API_BASE || "").replace(/\/$/, "");

// Centralized fetch with JSON + error handling
async function postJSON<T = any>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body ?? {}),
  });
  const text = await r.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON (ignore)
  }
  if (!r.ok) {
    const msg = data?.error || data?.message || `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return data as T;
}

let stripePromise: Promise<import("@stripe/stripe-js").Stripe | null> | null =
  null;
function getStripe() {
  if (!stripePromise) stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
  return stripePromise;
}

export type PlanCode = "platinum" | "silver" | "gold" | "business";

export async function startCheckout(plan?: PlanCode) {
  const { userId, email } = await getIdentity();
  if (!userId || !email) throw new Error("Sign in first.");

  console.log("🚀 startCheckout payload:", {
    userId,
    email,
    plan,
  });

  const data = await postJSON<{ url: string }>(
    `${base}/stripe/create-checkout-session`,
    { userId, email, plan }
  );

  console.log("✅ Checkout session response:", data);

  if (!data?.url) throw new Error("No checkout URL received.");
  window.location.href = data.url;
}

export async function openBillingPortal() {
  const { userId, email } = await getIdentity();
  if (!userId || !email) throw new Error("Sign in first.");

  const data = await postJSON<{ url: string }>(`${base}/stripe/portal`, {
    userId,
    email,
  });

  if (!data?.url) throw new Error("Could not open billing portal.");
  window.location.href = data.url;
}

export async function renewNow() {
  const { userId } = await getIdentity();
  if (!userId) throw new Error("Sign in first.");

  // May include client_secret when SCA is required
  return postJSON<{
    ok: boolean;
    subscription_status?: string;
    invoice_status?: string | null;
    payment_intent_status?: string | null;
    client_secret?: string | null;
  }>(`${base}/stripe/renew-now`, { userId });
}

export async function cancelSubscription() {
  const { userId } = await getIdentity();
  if (!userId) throw new Error("Sign in first.");

  try {
    await postJSON(`${base}/stripe/cancel`, { userId });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (/404/.test(msg) || /No active subscription/i.test(msg)) {
      throw new Error("No active subscription to cancel.");
    }
    if (/409/.test(msg) || /already scheduled/i.test(msg)) {
      throw new Error("Cancellation already scheduled.");
    }
    throw new Error(msg || "Cancel failed");
  }
}

export async function sendCancelFeedback(reason?: string, otherText?: string) {
  const { userId } = await getIdentity();
  if (!userId) throw new Error("Sign in first.");

  await postJSON(`${base}/stripe/cancel/feedback`, {
    userId,
    reason,
    otherText,
  });
}

export async function downgradeToRetentionPlan() {
  const { userId } = await getIdentity();
  if (!userId) throw new Error("Sign in first.");

  await postJSON(`${base}/stripe/downgrade`, { userId });
}

// 3DS / SCA helper
export async function confirmIfRequired(client_secret?: string) {
  if (!client_secret) return;

  const stripe = await getStripe();
  if (!stripe) throw new Error("Stripe.js failed to load");

  const { error, paymentIntent } = await stripe.confirmCardPayment(
    client_secret
  );

  if (error) throw error;
  if (paymentIntent?.status !== "succeeded") {
    throw new Error("Payment not completed.");
  }
}
