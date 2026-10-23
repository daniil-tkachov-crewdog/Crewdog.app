// client/features/auth/RequireAuth.tsx
//
// Route guard for the signed-in pages.
//
// Renders nothing while the session is still resolving, rather than
// redirecting: a refresh on /account would otherwise bounce to /login before
// the session came back. The attempted location is passed along in state so
// the login page can return the user to it.
//
// This is a UX guard, not a security boundary — the data behind it is
// protected by RLS and by the API's own auth checks.

import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthProvider";

export const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Avoid flicker/bounce while auth initializes
  if (loading) return null; // or a full-page spinner

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
};
