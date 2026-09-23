// Global app configuration set by the admin (API tab).
import { supabase } from "@/lib/supabase";

// Workflow 1 ("Job description") keys are unprefixed; workflow 2
// ("LinkedIn finder") keys carry a `finder_` prefix. Both live in the same
// app_settings.agent_config JSON blob, edited from the AI Agent sub-tabs.
export type AgentConfig = {
  max_contacts?: number;
  hr_roles?: string;
  extract_instructions?: string;
  verify_instructions?: string;
  search_instructions?: string;
  finder_max_results?: number;
  finder_min_confidence?: number;
  finder_search_instructions?: string;
  finder_verify_instructions?: string;
  finder_compress_instructions?: string;
  finder_extra_factor_hints?: string;
};

// Public-site metadata, edited in the admin SEO tab. The server renders these
// into index.html on every request so crawlers see them without running JS.
export type SeoFaqItem = { q: string; a: string };

export type SeoSettings = {
  title?: string;
  description?: string;
  keywords?: string;
  canonical?: string;
  og_title?: string;
  og_description?: string;
  og_image?: string;
  twitter_title?: string;
  twitter_description?: string;
  org_description?: string;
  app_description?: string;
  faq?: SeoFaqItem[];
};

// Per-plan AI allowances, in input-equivalent units (see usage.js).
// Omitted keys fall back to the defaults compiled into the server.
export type UsageLimits = {
  pro?: { five_hour?: number; week?: number };
  free?: { five_hour?: number; week?: number };
};

export type AppSettings = {
  chat_model: string;
  web_search: boolean;
  file_search: boolean;
  system_prompt: string;
  user_prompt_addition: string;
  agent_enabled: boolean;
  linkedin_finder_enabled: boolean;
  agent_config: AgentConfig;
  seo: SeoSettings;
  usage_limits: UsageLimits;
  updated_at?: string;
};

const DEFAULTS: AppSettings = {
  chat_model: "gpt-4o",
  web_search: false,
  file_search: false,
  system_prompt: "",
  user_prompt_addition: "",
  agent_enabled: false,
  linkedin_finder_enabled: false,
  agent_config: {},
  seo: {},
  usage_limits: {},
};

export async function getSettings(): Promise<AppSettings> {
  // Authenticated users can read the full row directly (RLS: authenticated).
  const { data, error } = await supabase
    .from("app_settings")
    .select("chat_model, web_search, file_search, system_prompt, user_prompt_addition, agent_enabled, linkedin_finder_enabled, agent_config, seo, usage_limits, updated_at")
    .eq("id", "global")
    .maybeSingle();
  if (!error && data) return { ...DEFAULTS, ...data };

  // Logged-out (anon) users are blocked by RLS from the table, so fall back to
  // the SECURITY DEFINER RPC that exposes the public settings — including the
  // system prompt — but NOT the hidden user_prompt_addition.
  try {
    const { data: pub } = await supabase.rpc("get_public_app_settings");
    const row = Array.isArray(pub) ? pub[0] : pub;
    if (row) return { ...DEFAULTS, ...row };
  } catch {
    /* fall through to defaults */
  }

  return DEFAULTS;
}

// Admin-only (enforced by RLS).
export async function saveSettings(
  patch: Partial<AppSettings>
): Promise<void> {
  const { error } = await supabase
    .from("app_settings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", "global");
  if (error) throw new Error(error.message);
}

export async function logTokenUsage(
  userId: string,
  model: string,
  usage: { input_tokens?: number; output_tokens?: number; total_tokens?: number }
): Promise<void> {
  await supabase.from("app_token_usage").insert({
    user_id: userId,
    model,
    input_tokens: usage.input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0,
    total_tokens: usage.total_tokens ?? 0,
  });
}
