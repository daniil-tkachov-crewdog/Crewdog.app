import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

export const supabase = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true, // handles OAuth return
    },
  }
);

// The server needs this to identify the caller on /api/chat (usage limits).
export async function getAccessToken(): Promise<string | null> {
  const { data: { session } = {} } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function getIdentity() {
  const { data: { session } = {} } = await supabase.auth.getSession();
  const user = session?.user || null;
  return { userId: user?.id ?? null, email: user?.email ?? null };
}
