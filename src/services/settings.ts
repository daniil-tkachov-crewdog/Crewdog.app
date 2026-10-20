// Global app configuration set by the admin (API tab).
import { supabase } from "@/lib/supabase";

// Workflow 1 ("Job description") keys are unprefixed; workflows 2 and 3 are one
// prompt each, and workflow 4 ("Accommodation Finder") carries an `accom_`
// prefix. All four live in the same app_settings.agent_config JSON blob, edited
// from the AI Agent sub-tabs.
export type AgentConfig = {
  // Workflow routing — the tool descriptions the chat model reads to pick a
  // workflow — and the contracts appended to the system prompt and to every
  // workflow result. Prompts like any other, so all editable.
  tool_find_linkedin_connections?: string;
  tool_find_linkedin_professionals?: string;
  tool_find_jobs?: string;
  tool_find_accommodation?: string;
  chat_workflow_contract?: string;
  chat_suggestions_contract?: string;
  chat_cards_presentation?: string;
  chat_suggestions_tail?: string;
  // Argument descriptions, one JSON object per workflow.
  tool_params_find_linkedin_connections?: string;
  tool_params_find_linkedin_professionals?: string;
  tool_params_find_jobs?: string;
  tool_params_find_accommodation?: string;
  max_contacts?: number;
  hr_roles?: string;
  extract_instructions?: string;
  verify_instructions?: string;
  search_instructions?: string;
  extract_input?: string;
  verify_input?: string;
  search_input?: string;
  // Workflows 2 and 3 are one editable prompt each, re-injected on every
  // message the chat model routes to them.
  linkedin_finder_prompt?: string;
  linkedin_finder_output_contract?: string;
  linkedin_finder_run_instruction?: string;
  job_finder_prompt?: string;
  job_finder_output_contract?: string;
  job_finder_run_instruction?: string;
  job_finder_agencies_off_rule?: string;
  // Job finder behaviour switches, separate from its prompts.
  jobfinder_max_age_days?: number;
  jobfinder_include_agencies?: boolean;
  jobfinder_verify_links?: boolean;
  // Workflow 4 ("Accommodation Finder") keys carry an `accom_` prefix.
  accom_max_results?: number;
  accom_max_age_days?: number;
  accom_listing_type?: "rent" | "buy";
  accom_verify_links?: boolean;
  accom_expiry_phrases?: string;
  accom_search_instructions_rent?: string;
  accom_search_instructions_buy?: string;
  accom_compress_instructions?: string;
  accom_run_instruction?: string;
  accom_no_budget_line?: string;
  accom_conditions_given_rule?: string;
  accom_no_conditions_rule?: string;
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
  // Whether the composer offers its microphone button. Speech is transcribed
  // and sent as ordinary text, so this only controls the button.
  voice_input: boolean;
  system_prompt: string;
  user_prompt_addition: string;
  agent_enabled: boolean;
  linkedin_finder_enabled: boolean;
  job_finder_enabled: boolean;
  accommodation_finder_enabled: boolean;
  // Kill switch for the paid Lusha contact lookup on LinkedIn cards. The server
  // reads this itself; this copy only drives the admin toggle.
  lusha_enabled: boolean;
  // Pro mode: a second chat path with its own prompt, its own API settings and
  // a required JSON output shape. Deliberately separate columns rather than a
  // shared record, so changing one mode cannot move the other.
  pro_system_prompt: string;
  // The OpenAI Structured Outputs schema, stored as text so the formatting the
  // admin typed survives. Parsed before use; see proSchema.js for the default.
  pro_json_schema: string;
  pro_chat_model: string;
  pro_web_search: boolean;
  pro_file_search: boolean;
  pro_voice_input: boolean;
  agent_config: AgentConfig;
  seo: SeoSettings;
  usage_limits: UsageLimits;
  updated_at?: string;
};

const DEFAULTS: AppSettings = {
  chat_model: "gpt-4o",
  web_search: false,
  file_search: false,
  voice_input: true,
  system_prompt: "",
  user_prompt_addition: "",
  agent_enabled: false,
  linkedin_finder_enabled: false,
  job_finder_enabled: false,
  accommodation_finder_enabled: false,
  lusha_enabled: false,
  pro_system_prompt: "",
  pro_json_schema: "",
  pro_chat_model: "gpt-4o",
  pro_web_search: true,
  pro_file_search: false,
  pro_voice_input: true,
  agent_config: {},
  seo: {},
  usage_limits: {},
};

export async function getSettings(): Promise<AppSettings> {
  // Authenticated users can read the full row directly (RLS: authenticated).
  const { data, error } = await supabase
    .from("app_settings")
    .select("chat_model, web_search, file_search, voice_input, system_prompt, user_prompt_addition, agent_enabled, linkedin_finder_enabled, job_finder_enabled, accommodation_finder_enabled, lusha_enabled, pro_system_prompt, pro_json_schema, pro_chat_model, pro_web_search, pro_file_search, pro_voice_input, agent_config, seo, usage_limits, updated_at")
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
