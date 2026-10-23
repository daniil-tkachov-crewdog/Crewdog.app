// client/core/supabase/client.ts
//
// The browser's Supabase client, and the two reads the rest of the app needs
// from a session.
//
// Exactly one client is created for the whole app: a second would keep its
// own copy of the session and the two would drift apart after a refresh.
// This holds the anon key only — every privileged operation goes through the
// API, which has the service-role key and never exposes it.

import { createClient } from "@supabase/supabase-js";
import { env } from "@/core/config/env";

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
