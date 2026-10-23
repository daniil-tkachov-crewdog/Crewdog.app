// client/features/auth/auth.adapter.ts
//
// The auth contract the app codes against.
//
// Everything the UI needs from authentication is listed here, in terms of
// plain users and tokens rather than any provider's types. The Supabase
// implementation is one folder down; keeping the seam means a provider
// change touches that file and not the pages.

export type AuthUser = {
  id: string;
  email: string | null;
  name?: string | null;
};
export type AuthSession = { accessToken: string | null };

export interface AuthAdapter {
  getSession(): Promise<{ user: AuthUser | null; session: AuthSession | null }>;
  onAuthStateChange(cb: (user: AuthUser | null) => void): () => void;

  signInWithPassword(email: string, password: string): Promise<void>;
  signUpWithPassword(email: string, password: string): Promise<void>;
  signInWithGoogle(redirectTo?: string): Promise<void>;
  signOut(): Promise<void>;

  requestPasswordReset(email: string, redirectTo?: string): Promise<void>;
  updatePassword(newPassword: string): Promise<void>;
}
