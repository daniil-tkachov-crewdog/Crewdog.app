import React from "react";
import type { AuthAdapter, AuthUser } from "@/features/auth/auth.adapter";
import { supabaseAuth } from "@/features/auth/adapters/supabase";

type Ctx = {
  user: AuthUser | null;
  loading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  signInWithGoogle: (redirectTo?: string) => Promise<void>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string, redirectTo?: string) => Promise<void>; // NEW
  updatePassword: (newPassword: string) => Promise<void>; // NEW
};

const AuthContext = React.createContext<Ctx | null>(null);

export const AuthProvider: React.FC<
  React.PropsWithChildren<{ adapter?: AuthAdapter }>
> = ({ children, adapter = supabaseAuth }) => {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let unsub = () => {};
    (async () => {
      const { user } = await adapter.getSession();
      setUser(user);
      setLoading(false);
      unsub = adapter.onAuthStateChange(setUser);
    })();
    return () => unsub();
  }, [adapter]);

  const value: Ctx = {
    user,
    loading,
    signInWithPassword: (e, p) => adapter.signInWithPassword(e, p),
    signUpWithPassword: (e, p) => adapter.signUpWithPassword(e, p),
    signInWithGoogle: (r) => adapter.signInWithGoogle(r),
    signOut: () => adapter.signOut(),
    requestPasswordReset: (email, redirectTo) =>
      adapter.requestPasswordReset(email, redirectTo),
    updatePassword: (newPassword) => adapter.updatePassword(newPassword),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
};
