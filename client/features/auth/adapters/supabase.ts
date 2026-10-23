// client/features/auth/adapters/supabase.ts
//
// The Supabase implementation of AuthAdapter.
//
// The only module in the frontend that calls supabase.auth directly. It maps
// Supabase's session shape onto the app's AuthUser, so nothing above it has
// to know where `name` lives in user_metadata.

import { supabase } from "@/core/supabase/client";
import type { AuthAdapter, AuthSession, AuthUser } from "@/features/auth/auth.adapter";

export const supabaseAuth: AuthAdapter = {
  async getSession() {
    const { data } = await supabase.auth.getSession();
    const s = data.session;
    const user: AuthUser | null = s?.user
      ? {
          id: s.user.id,
          email: s.user.email ?? null,
          name: s.user.user_metadata?.name ?? null,
        }
      : null;
    const session: AuthSession | null = s
      ? { accessToken: s.access_token ?? null }
      : null;
    return { user, session };
  },

  onAuthStateChange(cb) {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const u: AuthUser | null = session?.user
        ? {
            id: session.user.id,
            email: session.user.email ?? null,
            name: session.user.user_metadata?.name ?? null,
          }
        : null;
      cb(u);
    });
    return () => sub.subscription.unsubscribe();
  },

  async signInWithPassword(email, password) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(error.message);
  },

  async signUpWithPassword(email, password) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/verify` },
    });
    if (error) throw new Error(error.message);
  },

  async signInWithGoogle(redirectTo) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo ?? `${window.location.origin}/run` },
    });
    if (error) throw new Error(error.message);
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  },

  async requestPasswordReset(email, redirectTo) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectTo ?? `${window.location.origin}/reset-password`,
    });
    if (error) throw new Error(error.message);
  },

  async updatePassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  },
};
