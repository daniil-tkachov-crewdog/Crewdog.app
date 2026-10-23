// client/features/auth/ForgotPasswordPage.tsx
//
// Requests a password-reset email.
//
// It reports success whether or not the address has an account: saying
// "no such user" would turn this form into a way to test which emails are
// registered.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, ArrowLeft, CheckCircle2, Sparkles, Plus } from "lucide-react";
import { toast } from "sonner";
import blueFluidBg from "@/assets/blue-fluid-bg.jpg";
import { useAuth } from "@/features/auth/AuthProvider";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { requestPasswordReset } = useAuth();

  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!email) {
      toast.error("Email is required", {
        description: "Please enter your email address",
      });
      return;
    }
    if (!email.includes("@")) {
      toast.error("Invalid email", {
        description: "Please enter a valid email address",
      });
      return;
    }

    try {
      setIsLoading(true);

      // Real Supabase request via adapter.
      // Adapter default redirect is `${origin}/reset-password`.
      await requestPasswordReset(email);

      setIsSuccess(true);
      toast.success("Reset link sent!", {
        description: `Check your inbox at ${email}`,
        icon: <CheckCircle2 className="w-5 h-5" />,
      });

      // Optional redirect after a short delay
      setTimeout(() => navigate("/login"), 3000);
    } catch (err: any) {
      toast.error("Failed to send reset email", {
        description: err?.message ?? "Please try again later.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-muted/30 to-muted/10 relative overflow-hidden">
      {/* Subtle ambient background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-muted/20 via-transparent to-transparent" />

      {/* Main Card Container */}
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
                    Reset Your Password
                  </h1>
                  <p className="text-sm md:text-base text-muted-foreground flex items-center gap-2">
                    Enter your email to receive a reset link
                    <Sparkles className="w-4 h-4 text-primary" />
                  </p>
                </motion.div>

                {/* Form */}
                <form
                  onSubmit={handleSubmit}
                  className="space-y-6 md:space-y-8"
                >
                  {/* Email Input with animation */}
                  <motion.div
                    className="relative"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                  >
                    <Input
                      type="email"
                      placeholder="Enter your email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setEmailFocused(true)}
                      onBlur={() => setEmailFocused(false)}
                      className="pl-5 pr-12 h-12 sm:h-14 rounded-full bg-muted/40 border border-muted hover:border-muted-foreground/20 focus:border-primary transition-all duration-300 text-sm sm:text-base"
                      disabled={isLoading}
                    />
                    <motion.div
                      animate={{
                        scale: emailFocused ? 1.1 : 1,
                        color: emailFocused
                          ? "hsl(var(--primary))"
                          : "hsl(var(--muted-foreground))",
                      }}
                      transition={{ duration: 0.2 }}
                    >
                      <Mail className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5" />
                    </motion.div>
                  </motion.div>

                  {/* Submit Button */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                  >
                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="w-full h-12 sm:h-14 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 text-sm sm:text-base font-semibold shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? (
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
                          Sending Reset Link...
                        </motion.div>
                      ) : (
                        <motion.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex items-center gap-2"
                        >
                          Send Reset Link
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
                      💡{" "}
                      <span className="font-medium text-foreground">Tip:</span>{" "}
                      Check your spam folder if you don't see the email within a
                      few minutes.
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
                  Check Your Email
                </motion.h2>

                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-sm sm:text-base text-muted-foreground mb-8"
                >
                  We've sent a password reset link to
                  <br />
                  <span className="font-semibold text-foreground">{email}</span>
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-sm text-muted-foreground"
                >
                  Redirecting to login in 3 seconds...
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Side - Blue Fluid Background */}
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

          {/* Floating particles */}
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
