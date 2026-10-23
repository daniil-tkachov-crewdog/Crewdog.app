// client/features/auth/RequireAdmin.tsx
//
// Route guard for /admin.
//
// The admin is identified by a hardcoded email. That is enough here because
// this only decides whether to render the screen: every privileged read and
// write behind it is checked again server-side, where isAdminUser() reads
// the role out of the verified token. Changing the admin should still mean
// changing both.

import { Navigate } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthProvider";

const ADMIN_EMAIL = "crewdog.app@gmail.com";

export const RequireAdmin = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  // Avoid flicker/bounce while auth initializes
  if (loading) return null;

  if (!user || user.email?.toLowerCase() !== ADMIN_EMAIL) {
    return <Navigate to="/chat" replace />;
  }

  return <>{children}</>;
};
