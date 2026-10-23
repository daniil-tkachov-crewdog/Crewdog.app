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
