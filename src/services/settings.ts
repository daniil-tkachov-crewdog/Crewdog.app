// Global app configuration set by the admin (API tab).
import { supabase } from "@/lib/supabase";

export type AgentConfig = {
  max_contacts?: number;
  hr_roles?: string;
  extract_instructions?: string;
  verify_instructions?: string;
  search_instructions?: string;
};

export type AppSettings = {
  chat_model: string;
  web_search: boolean;
  file_search: boolean;
  system_prompt: string;
  user_prompt_addition: string;
  agent_enabled: boolean;
  agent_config: AgentConfig;
  updated_at?: string;
};

const DEFAULTS: AppSettings = {
  chat_model: "gpt-4o",
  web_search: false,
  file_search: false,
  system_prompt: "",
  user_prompt_addition: "",
  agent_enabled: false,
  agent_config: {},
};

export async function getSettings(): Promise<AppSettings> {
  // Authenticated users can read the full row directly (RLS: authenticated).
  const { data, error } = await supabase
    .from("app_settings")
    .select("chat_model, web_search, file_search, system_prompt, user_prompt_addition, agent_enabled, agent_config, updated_at")
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
