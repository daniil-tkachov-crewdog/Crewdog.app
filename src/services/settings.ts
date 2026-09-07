// Global app configuration set by the admin (API tab).
import { supabase } from "@/lib/supabase";

export type AppSettings = {
  chat_model: string;
  web_search: boolean;
  file_search: boolean;
  system_prompt: string;
  user_prompt_addition: string;
  updated_at?: string;
};

const DEFAULTS: AppSettings = {
  chat_model: "gpt-4o",
  web_search: false,
  file_search: false,
  system_prompt: "",
  user_prompt_addition: "",
};

export async function getSettings(): Promise<AppSettings> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("chat_model, web_search, file_search, system_prompt, user_prompt_addition, updated_at")
    .eq("id", "global")
    .maybeSingle();
  if (error || !data) return DEFAULTS;
  return { ...DEFAULTS, ...data };
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
