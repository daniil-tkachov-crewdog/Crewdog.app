// client/routes.tsx
//
// The route table: every URL the SPA answers, and the page behind it.
//
// Split out of App.tsx so that file is providers only. One page per feature
// folder, so a route is also a map of where that screen's code lives.

import { Routes, Route, Navigate } from "react-router-dom";

import Chat from "@/features/chat/ChatPage";
import Settings from "@/features/settings/SettingsPage";
import Account from "@/features/account/AccountPage";
import Admin from "@/features/admin/AdminPage";
import Support from "@/features/support/SupportPage";

import Login from "@/features/auth/LoginPage";
import Verify from "@/features/auth/VerifyPage";
import ForgotPassword from "@/features/auth/ForgotPasswordPage";
import ResetPassword from "@/features/auth/ResetPasswordPage";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { RequireAdmin } from "@/features/auth/RequireAdmin";

import Pricing from "@/features/billing/PricingPage";
import Success from "@/features/billing/SuccessPage";
import Cancel from "@/features/billing/CancelPage";

import FAQ from "@/features/legal/FaqPage";
import Privacy from "@/features/legal/PrivacyPage";
import Terms from "@/features/legal/TermsPage";
import NotFound from "@/features/legal/NotFoundPage";

/**
 * Every route, in the order they were originally declared.
 *
 * "/" redirects to /chat rather than rendering a landing page: the chat IS
 * the product's front door, and it renders for signed-out visitors too.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/chat" replace />} />
      <Route path="/chat" element={<Chat />} />
      <Route path="/settings" element={<Settings />} />

      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify" element={<Verify />} />

      {/* The only two routes behind a guard. Everything else is public,
          including /pricing and the legal pages, because crawlers need them. */}
      <Route
        path="/account"
        element={
          <RequireAuth>
            <Account />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <Admin />
          </RequireAdmin>
        }
      />

      <Route path="/pricing" element={<Pricing />} />
      <Route path="/success" element={<Success />} />
      <Route path="/cancel" element={<Cancel />} />

      <Route path="/faq" element={<FAQ />} />
      <Route path="/support" element={<Support />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
