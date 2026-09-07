import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";

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
