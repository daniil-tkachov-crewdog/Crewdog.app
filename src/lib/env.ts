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
