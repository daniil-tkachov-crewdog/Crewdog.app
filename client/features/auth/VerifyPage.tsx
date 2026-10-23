// src/pages/Verify.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/core/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Mail,
  ArrowRight,
  RefreshCw,
  Home,
  ShieldCheck,
  Zap,
  Star,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

function parseHashParams() {
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.substring(1)
    : window.location.hash;
  const params = new URLSearchParams(hash);
  return {
    access_token: params.get("access_token"),
    refresh_token: params.get("refresh_token"),
    type: params.get("type"), // 'signup' | 'email_change' | others
  };
}

// Custom confetti particle component
const ConfettiParticle = ({ delay }: { delay: number }) => {
  const colors = [
    "bg-blue-500",
    "bg-purple-500",
    "bg-pink-500",
    "bg-emerald-500",
    "bg-yellow-500",
    "bg-red-500",
  ];
  const randomColor = colors[Math.floor(Math.random() * colors.length)];
  const randomX = Math.random() * 100;
  const randomRotate = Math.random() * 360;
  const randomDuration = 2 + Math.random() * 2;

  return (
    <motion.div
      className={`absolute w-3 h-3 ${randomColor} rounded-full`}
      initial={{
        top: "-10%",
        left: `${randomX}%`,
        opacity: 1,
        rotate: 0,
      }}
      animate={{
        top: "110%",
        opacity: 0,
        rotate: randomRotate,
      }}
      transition={{
        duration: randomDuration,
        delay: delay,
        ease: "linear",
      }}
    />
  );
};

export default function Verify() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<
    "idle" | "verifying" | "ok" | "error" | "skipped"
  >("idle");
  const [message, setMessage] = useState<string>("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [countdown, setCountdown] = useState(5);

  const { access_token, refresh_token, type } = useMemo(parseHashParams, []);

  useEffect(() => {
    (async () => {
      try {
        // Set initial verifying state
        setStatus("verifying");

        // Guard: only handle signup/email_change events that carry tokens
        if (!access_token || !refresh_token) {
          setTimeout(() => {
            setStatus("skipped");
            setMessage(
              "Missing tokens in URL. If you already verified, you can continue."
            );
          }, 800);
          return;
        }
        if (type !== "signup" && type !== "email_change") {
          setTimeout(() => {
            setStatus("skipped");
            setMessage(
              "This link is not a verification event. You can continue."
            );
          }, 800);
          return;
        }

        // Add a minimum delay for better UX (shows loading state)
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (error) throw error;

        // Clean the URL (remove hash tokens)
        if (window.history.replaceState) {
          const clean = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, clean);
        }

        setStatus("ok");
        setShowConfetti(true);
        setMessage(
          type === "signup"
            ? "Your email has been verified successfully! Welcome to CrewDog 🎉"
            : "Your email change has been verified successfully!"
        );
        toast.success("Email verified!", {
          description: "You're all set. Redirecting you...",
          icon: <CheckCircle2 className="w-5 h-5" />,
        });

        // Hide confetti after 5 seconds
        setTimeout(() => setShowConfetti(false), 5000);
      } catch (e: any) {
        setStatus("error");
        setMessage(
          e?.message ||
            "Verification failed. The link may be invalid or expired."
        );
        toast.error("Verification failed", {
          description: e?.message ?? "Invalid or expired link.",
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-redirect countdown on success
  useEffect(() => {
    if (status === "ok") {
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            navigate("/run");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [status, navigate]);

  // Render different states
  const renderContent = () => {
    switch (status) {
      case "idle":
      case "verifying":
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="text-center"
          >
            <div className="relative mb-8 flex justify-center">
              <motion.div
                animate={{
                  rotate: 360,
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "linear",
                }}
                className="relative"
              >
                <div className="w-24 h-24 rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 p-1">
                  <div className="w-full h-full rounded-full bg-background flex items-center justify-center">
                    <Mail className="w-12 h-12 text-primary" />
                  </div>
                </div>
              </motion.div>
              <motion.div
                className="absolute inset-0 flex items-center justify-center"
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.5, 0, 0.5],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <div className="w-32 h-32 rounded-full bg-primary/20" />
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h2 className="text-3xl font-bold mb-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Verifying Your Email
              </h2>
              <p className="text-muted-foreground mb-6">
                Please wait while we securely verify your account...
              </p>

              <div className="flex items-center justify-center gap-2 mb-8">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    repeatDelay: 0.2,
                  }}
                  className="w-2 h-2 rounded-full bg-blue-500"
                />
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    repeatDelay: 0.2,
                    delay: 0.2,
                  }}
                  className="w-2 h-2 rounded-full bg-purple-500"
                />
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    repeatDelay: 0.2,
                    delay: 0.4,
                  }}
                  className="w-2 h-2 rounded-full bg-pink-500"
                />
              </div>

              {/* Progress steps */}
              <div className="space-y-3 text-left max-w-md mx-auto">
                {[
                  { icon: ShieldCheck, text: "Validating security tokens" },
                  { icon: Zap, text: "Activating your account" },
                  { icon: Sparkles, text: "Setting up your workspace" },
                ].map((step, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + idx * 0.15 }}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                  >
                    <step.icon className="w-5 h-5 text-primary" />
                    <span className="text-sm text-muted-foreground">
                      {step.text}
                    </span>
                    <Loader2 className="w-4 h-4 ml-auto animate-spin text-primary" />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        );

      case "ok":
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 15,
              }}
              className="relative mb-8 flex justify-center"
            >
              <div className="w-24 h-24 rounded-full bg-gradient-to-r from-emerald-500 to-green-500 flex items-center justify-center shadow-lg shadow-emerald-500/50">
                <CheckCircle2 className="w-14 h-14 text-white" />
              </div>
              <motion.div
                className="absolute inset-0"
                animate={{
                  scale: [1, 1.5, 2],
                  opacity: [0.5, 0.2, 0],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeOut",
                }}
              >
                <div className="w-full h-full rounded-full bg-emerald-500/30" />
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h2 className="text-3xl font-bold mb-3 bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text text-transparent">
                Email Verified! 🎉
              </h2>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto leading-relaxed">
                {message}
              </p>

              {/* Success benefits */}
              <div className="space-y-3 text-left max-w-md mx-auto mb-8">
                {[
                  { icon: CheckCircle2, text: "Account fully activated" },
                  { icon: ShieldCheck, text: "Security verified" },
                  { icon: Sparkles, text: "Ready to use all features" },
                ].map((item, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + idx * 0.1 }}
                    className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800"
                  >
                    <item.icon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
                      {item.text}
                    </span>
                  </motion.div>
                ))}
              </div>

              {/* Auto-redirect countdown */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted text-sm text-muted-foreground mb-6"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Redirecting in {countdown} seconds...</span>
              </motion.div>

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link to="/run" className="flex-1 sm:flex-initial">
                  <Button size="lg" className="w-full group">
                    <span>Get Started</span>
                    <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <Link to="/account" className="flex-1 sm:flex-initial">
                  <Button variant="outline" size="lg" className="w-full">
                    View Account
                  </Button>
                </Link>
              </div>
            </motion.div>
          </motion.div>
        );

      case "error":
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 15,
              }}
              className="mb-8 flex justify-center"
            >
              <div className="w-24 h-24 rounded-full bg-gradient-to-r from-red-500 to-rose-500 flex items-center justify-center shadow-lg shadow-red-500/50">
                <AlertCircle className="w-14 h-14 text-white" />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h2 className="text-3xl font-bold mb-3 bg-gradient-to-r from-red-600 to-rose-600 bg-clip-text text-transparent">
                Verification Failed
              </h2>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto leading-relaxed">
                {message}
              </p>

              {/* Error help text */}
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-8 max-w-md mx-auto">
                <p className="text-sm text-red-900 dark:text-red-100 mb-3 font-medium">
                  Common solutions:
                </p>
                <ul className="text-sm text-red-800 dark:text-red-200 space-y-2 text-left">
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5">•</span>
                    <span>Check if you've already verified your email</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5">•</span>
                    <span>Request a new verification email</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5">•</span>
                    <span>Make sure you're using the latest email link</span>
                  </li>
                </ul>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  size="lg"
                  onClick={() => window.location.reload()}
                  className="flex-1 sm:flex-initial"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </Button>
                <Link to="/login" className="flex-1 sm:flex-initial">
                  <Button variant="outline" size="lg" className="w-full">
                    <Home className="w-4 h-4 mr-2" />
                    Back to Login
                  </Button>
                </Link>
              </div>
            </motion.div>
          </motion.div>
        );

      case "skipped":
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 15,
              }}
              className="mb-8 flex justify-center"
            >
              <div className="w-24 h-24 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/50">
                <AlertCircle className="w-14 h-14 text-white" />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h2 className="text-3xl font-bold mb-3 bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                No Verification Needed
              </h2>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto leading-relaxed">
                {message}
              </p>

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link to="/run" className="flex-1 sm:flex-initial">
                  <Button size="lg" className="w-full">
                    Continue to App
                  </Button>
                </Link>
                <Link to="/login" className="flex-1 sm:flex-initial">
                  <Button variant="outline" size="lg" className="w-full">
                    <Home className="w-4 h-4 mr-2" />
                    Back to Login
                  </Button>
                </Link>
              </div>
            </motion.div>
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-20 left-10 w-72 h-72 bg-blue-400/10 rounded-full blur-3xl"
          animate={{
            x: [0, 50, 0],
            y: [0, 30, 0],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute bottom-20 right-10 w-96 h-96 bg-purple-400/10 rounded-full blur-3xl"
          animate={{
            x: [0, -50, 0],
            y: [0, -30, 0],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 w-80 h-80 bg-pink-400/10 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      {/* Custom confetti effect on success */}
      <AnimatePresence>
        {showConfetti && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-50">
            {Array.from({ length: 50 }).map((_, i) => (
              <ConfettiParticle key={i} delay={i * 0.02} />
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* Main content card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-2xl"
      >
        <Card className="border-2 shadow-2xl backdrop-blur-sm bg-background/95">
          <CardContent className="pt-12 pb-12 px-8">
            <AnimatePresence mode="wait">{renderContent()}</AnimatePresence>
          </CardContent>
        </Card>

        {/* Footer note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-center text-sm text-muted-foreground mt-6"
        >
          Having trouble?{" "}
          <Link
            to="/login"
            className="text-primary hover:underline font-medium"
          >
            Contact support
          </Link>
        </motion.p>
      </motion.div>
    </div>
  );
}
