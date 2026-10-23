// client/core/config/env.ts
//
// The environment contract, validated once at startup.
//
// Parsed rather than read ad hoc so a missing or malformed variable fails
// immediately and by name, instead of surfacing later as an undefined URL in
// a fetch. The three required entries are the ones the app cannot render
// without; everything optional has a fallback in config.ts.
//
// Only VITE_-prefixed variables exist here, because only those are inlined
// into the bundle — which is also why no secret may ever be added to this
// list.

import { z } from "zod";

const Env = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(10),
  VITE_SITE_URL: z.string().url().optional(),
  VITE_STRIPE_PUBLISHABLE_KEY: z.string().min(10),
  VITE_API_BASE: z.string().optional(),
  VITE_N8N_SUPPORT_WEBHOOK: z.string().url().optional(),
  VITE_N8N_CV_WEBHOOK: z.string().url().optional(),
  VITE_N8N_CONTACT_DETAILS_WEBHOOK: z.string().url().optional(),
});

export const env = Env.parse(import.meta.env);
