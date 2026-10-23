// client/features/auth/ResetPasswordPage.tsx
//
// Sets a new password after following the emailed link.
//
// The link carries a recovery token that Supabase turns into a short-lived
// session when the page loads — so reaching this screen without one means
// the link was stale or already used, and the form cannot proceed.

import { useEffect, useState } from "react";
import { supabase } from "@/core/supabase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import {
  LockKeyhole,
  CheckCircle2,
  ArrowLeft,
  Sparkles,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import blueFluidBg from "@/assets/blue-fluid-bg.jpg";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { updatePassword } = useAuth();

  const [ready, setReady] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [pw1Focused, setPw1Focused] = useState(false);
  const [pw2Focused, setPw2Focused] = useState(false);

  // Validate magic-link session provided by Supabase
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        toast.error("This reset link is invalid or expired.");
      } else {
        setReady(true);
      }
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pw1.length < 6) {
      toast.error("Password too short", {
        description: "Must be at least 6 characters.",
      });
      return;
    }
    if (pw1 !== pw2) {
      toast.error("Passwords don't match");
      return;
    }
    try {
      setSaving(true);
      await updatePassword(pw1);
      setIsSuccess(true);
      toast.success("Password updated", {
        description: "You can now sign in with your new password.",
      });

      // Redirect after a short delay
      setTimeout(() => navigate("/login", { replace: true }), 2500);
    } catch (e: any) {
      toast.error("Failed to update password", {
        description: e?.message ?? "Try again later.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-muted/30 to-muted/10 relative overflow-hidden">
      {/* Subtle ambient background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-muted/20 via-transparent to-transparent" />

      {/* Main Card Container - Full Screen */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative w-full h-screen bg-card shadow-[0_20px_80px_rgba(0,0,0,0.15)] overflow-hidden flex"
      >
        {/* Left Side - Form */}
        <div className="w-full lg:w-1/2 p-6 sm:p-10 md:p-12 lg:p-16 flex flex-col justify-center bg-card/95 backdrop-blur-sm overflow-y-auto">
          {/* Back Button */}
          <motion.button
            onClick={() => navigate("/login")}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 md:mb-10 transition-colors"
            whileHover={{ x: -5 }}
            whileTap={{ scale: 0.95 }}
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm sm:text-base">Back to Login</span>
          </motion.button>

          {/* Logo with animation */}
          <motion.div
            className="flex items-center gap-3 mb-8 md:mb-10"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <motion.div
              className="w-10 h-10 sm:w-12 sm:h-12 bg-foreground rounded-xl flex items-center justify-center shadow-md"
              whileHover={{ scale: 1.05, rotate: 5 }}
              whileTap={{ scale: 0.95 }}
            >
              <Plus className="w-6 h-6 sm:w-7 sm:h-7 text-background" />
            </motion.div>
            <span className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
              CrewDog
            </span>
          </motion.div>

          <AnimatePresence mode="wait">
            {!isSuccess ? (
              <motion.div
                key="form"
                initial={{ opacity: 1 }}
                exit={{ opacity: 0, x: -50 }}
              >
                {/* Header */}
                <motion.div
                  className="mb-8 md:mb-10"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                >
                  <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-2 md:mb-3 tracking-tight">
                    Set a New Password
                  </h1>
                  <p className="text-sm md:text-base text-muted-foreground flex items-center gap-2">
                    Enter and confirm your new password
                    <Sparkles className="w-4 h-4 text-primary" />
                  </p>
                </motion.div>

                {/* Form */}
                <form onSubmit={onSubmit} className="space-y-6 md:space-y-8">
                  {!ready && (
                    <p className="text-sm text-muted-foreground">
                      Validating reset link…
                    </p>
                  )}

                  {ready && (
                    <>
                      {/* New Password */}
                      <motion.div
                        className="relative"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                      >
                        <Input
                          type="password"
                          placeholder="New password"
                          value={pw1}
                          onChange={(e) => setPw1(e.target.value)}
                          onFocus={() => setPw1Focused(true)}
                          onBlur={() => setPw1Focused(false)}
                          disabled={saving}
                          className="pl-5 pr-12 h-12 sm:h-14 rounded-full bg-muted/40 border border-muted hover:border-muted-foreground/20 focus:border-primary transition-all duration-300 text-sm sm:text-base"
                        />
                        <motion.div
                          animate={{
                            scale: pw1Focused ? 1.1 : 1,
                            color: pw1Focused
                              ? "hsl(var(--primary))"
                              : "hsl(var(--muted-foreground))",
                          }}
                          transition={{ duration: 0.2 }}
                        >
                          <LockKeyhole className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5" />
                        </motion.div>
                      </motion.div>

                      {/* Confirm Password */}
                      <motion.div
                        className="relative"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                      >
                        <Input
                          type="password"
                          placeholder="Confirm new password"
                          value={pw2}
                          onChange={(e) => setPw2(e.target.value)}
                          onFocus={() => setPw2Focused(true)}
                          onBlur={() => setPw2Focused(false)}
                          disabled={saving}
                          className="pl-5 pr-12 h-12 sm:h-14 rounded-full bg-muted/40 border border-muted hover:border-muted-foreground/20 focus:border-primary transition-all duration-300 text-sm sm:text-base"
                        />
                        <motion.div
                          animate={{
                            scale: pw2Focused ? 1.1 : 1,
                            color: pw2Focused
                              ? "hsl(var(--primary))"
                              : "hsl(var(--muted-foreground))",
                          }}
                          transition={{ duration: 0.2 }}
                        >
                          <LockKeyhole className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5" />
                        </motion.div>
                      </motion.div>
                    </>
                  )}

                  {/* Submit Button */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                  >
                    <Button
                      type="submit"
                      disabled={!ready || saving}
                      className="w-full h-12 sm:h-14 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm sm:text-base font-semibold shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? (
                        <motion.div
                          className="flex items-center gap-2"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                        >
                          <motion.div
                            className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full"
                            animate={{ rotate: 360 }}
                            transition={{
                              duration: 1,
                              repeat: Infinity,
                              ease: "linear",
                            }}
                          />
                          Updating...
                        </motion.div>
                      ) : (
                        <motion.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex items-center gap-2"
                        >
                          Update password
                          <motion.div
                            initial={{ x: 0 }}
                            whileHover={{ x: 5 }}
                            transition={{ duration: 0.2 }}
                          >
                            →
                          </motion.div>
                        </motion.span>
                      )}
                    </Button>
                  </motion.div>

                  {/* Info Box */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.5 }}
                    className="bg-muted/30 rounded-2xl p-4 sm:p-5 border border-muted"
                  >
                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      🔐{" "}
                      <span className="font-medium text-foreground">Tip:</span>{" "}
                      Use at least 6 characters. For better security, include a
                      mix of letters, numbers, and symbols.
                    </p>
                  </motion.div>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="success"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", duration: 0.6 }}
                  className="w-20 h-20 sm:w-24 sm:h-24 bg-primary/10 rounded-full flex items-center justify-center mb-6"
                >
                  <CheckCircle2 className="w-12 h-12 sm:w-14 sm:h-14 text-primary" />
                </motion.div>

                <motion.h2
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-3"
                >
                  Password Updated
                </motion.h2>

                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-sm sm:text-base text-muted-foreground mb-8"
                >
                  You can now log in using your new password.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-sm text-muted-foreground"
                >
                  Redirecting to login…
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Side - Blue Fluid Background Image */}
        <div className="hidden lg:block lg:w-1/2 relative overflow-hidden">
          <motion.div
            className="absolute inset-0"
            initial={{ scale: 1.1, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 1.5 }}
          >
            <img
              src={blueFluidBg}
              alt="Blue Fluid Background"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-[#1e3a8a]/30 via-transparent to-[#172554]/30" />
          </motion.div>
          {/* Floating particles overlay */}
          <div className="absolute inset-0 z-10 pointer-events-none">
            {[...Array(15)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1 h-1 bg-white/40 rounded-full"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                }}
                animate={{
                  y: [-20, -60, -20],
                  opacity: [0, 1, 0],
                  scale: [0, 1.5, 0],
                }}
                transition={{
                  duration: 3 + Math.random() * 2,
                  repeat: Infinity,
                  delay: Math.random() * 3,
                }}
              />
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
