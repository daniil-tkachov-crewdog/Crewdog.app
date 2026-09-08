import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Chrome, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { Wordmark, ThemeToggle } from "@/components/layout/chrome";
import {
  INPUT,
  BTN_ACCENT,
  BTN_GHOST,
  FIELD_LABEL,
  SECTION_LABEL,
  SECONDARY,
  MUTED,
} from "@/components/account/ui";

export default function Login() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const from = sp.get("from") ?? "/chat";

  const { user, signInWithPassword, signUpWithPassword, signInWithGoogle } =
    useAuth();

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user) navigate("/chat", { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !email.includes("@")) {
      toast.error("Invalid email", {
        description: "Please enter a valid email address",
      });
      return;
    }
    if (!password || password.length < 6) {
      toast.error("Password too short", {
        description: "Password must be at least 6 characters",
      });
      return;
    }
    if (!isLogin && password !== confirmPassword) {
      toast.error("Passwords don't match", {
        description: "Please make sure your passwords match",
      });
      return;
    }

    try {
      setIsLoading(true);
      if (isLogin) {
        await signInWithPassword(email, password);
        toast.success("Welcome back!", {
          description: `Logged in as ${email}`,
          icon: <CheckCircle2 className="w-5 h-5" />,
        });
      } else {
        await signUpWithPassword(email, password);
        toast.success("Verify your email", {
          description: "We've sent you a verification link.",
        });
      }
      navigate(from, { replace: true });
    } catch (err: any) {
      toast.error(isLogin ? "Login failed" : "Registration failed", {
        description: err?.message ?? "Something went wrong",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogle = async () => {
    try {
      setIsLoading(true);
      await signInWithGoogle(`${window.location.origin}${from}`);
    } catch (err: any) {
      toast.error("Google sign-in failed", {
        description: err?.message ?? "Something went wrong",
      });
      setIsLoading(false);
    }
  };

  const tabCls = (active: boolean) =>
    "flex-1 rounded-[10px] py-[10px] text-[13px] font-medium transition-colors " +
    (active
      ? "bg-[rgba(26,25,23,0.07)] text-[#1A1917] dark:bg-[rgba(255,255,255,0.09)] dark:text-[#ECEBE8]"
      : "text-[#6E6B64] hover:bg-[rgba(26,25,23,0.05)] dark:text-[#96938C] dark:hover:bg-[rgba(255,255,255,0.05)]");

  return (
    <div className="flex min-h-screen w-full bg-white font-grotesk text-[#1A1917] dark:bg-[#17161A] dark:text-[#ECEBE8]">
      {/* Left: form */}
      <div className="relative flex w-full flex-col justify-center px-6 py-10 sm:px-10 lg:w-1/2 lg:px-16">
        <div className="absolute right-5 top-5">
          <ThemeToggle />
        </div>
        <div className="mx-auto w-full max-w-[440px]">
          <button
            onClick={() => navigate("/")}
            aria-label="Go to homepage"
            className="mb-10"
          >
            <Wordmark />
          </button>

          <h1 className="text-[clamp(28px,4vw,38px)] font-semibold tracking-[-0.02em]">
            {isLogin ? "Welcome back." : "Start your search."}
          </h1>
          <p className={`mt-2 text-[15px] leading-[1.6] ${SECONDARY}`}>
            {isLogin
              ? "Sign in to discover your next client."
              : "Create an account to find the lead behind every advert."}
          </p>

          {/* Tabs */}
          <div className="mt-7 flex gap-1 rounded-[12px] bg-[#F7F7F5] p-1 dark:bg-[#111014]">
            <button type="button" onClick={() => setIsLogin(true)} className={tabCls(isLogin)}>
              Sign in
            </button>
            <button type="button" onClick={() => setIsLogin(false)} className={tabCls(!isLogin)}>
              Sign up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="email" className={FIELD_LABEL}>
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                inputMode="email"
                className={INPUT}
                disabled={isLoading}
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className={FIELD_LABEL}>
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  className={INPUT + " pr-11"}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute inset-y-0 right-3 flex items-center hover:text-[#1A1917] dark:hover:text-[#ECEBE8] ${MUTED}`}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Confirm password (sign up) */}
            <AnimatePresence mode="wait">
              {!isLogin && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <label htmlFor="confirm" className={FIELD_LABEL}>
                    Confirm password
                  </label>
                  <input
                    id="confirm"
                    type={showPassword ? "text" : "password"}
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    className={INPUT}
                    disabled={isLoading}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Remember + forgot */}
            {isLogin && (
              <div className="flex items-center justify-between">
                <label className={`flex cursor-pointer select-none items-center gap-2 text-[14px] ${SECONDARY}`}>
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="accent-[#E0480F] dark:accent-[#FF5A1F]"
                    disabled={isLoading}
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  onClick={() => navigate("/forgot-password")}
                  className="text-[13px] text-[#E0480F] hover:underline dark:text-[#FF5A1F]"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-[14px] text-[15px] ${BTN_ACCENT}`}
            >
              {isLoading ? "Processing…" : isLogin ? "Log in" : "Create account"}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-[14px] py-1">
              <span className="h-px flex-1 bg-[rgba(26,25,23,0.1)] dark:bg-[rgba(255,255,255,0.1)]" />
              <span className={`text-[11px] uppercase tracking-[0.1em] ${MUTED}`}>or</span>
              <span className="h-px flex-1 bg-[rgba(26,25,23,0.1)] dark:bg-[rgba(255,255,255,0.1)]" />
            </div>

            {/* Google */}
            <button
              type="button"
              onClick={handleGoogle}
              disabled={isLoading}
              className={`flex w-full items-center justify-center gap-2 py-[13px] ${BTN_GHOST}`}
            >
              <Chrome className="h-5 w-5" />
              Continue with Google
            </button>
          </form>
        </div>
      </div>

      {/* Right: branded Radar panel */}
      <div className="relative hidden overflow-hidden bg-[#F7F7F5] lg:flex lg:w-1/2 lg:flex-col lg:justify-center dark:bg-[#111014]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-32 -top-24 h-[560px] w-[560px] rounded-full border border-[#E0480F]/20 dark:border-[#FF5A1F]/20"
        >
          <div className="absolute inset-24 rounded-full border border-[#E0480F]/[0.14] dark:border-[#FF5A1F]/[0.14]" />
          <div className="absolute inset-[190px] rounded-full border border-[#E0480F]/10 dark:border-[#FF5A1F]/10" />
          <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#E0480F] dark:bg-[#FF5A1F]" />
        </div>

        <div className="relative z-10 px-16">
          <span className={SECTION_LABEL}>Competitor advert intelligence</span>
          <h2 className="mt-6 max-w-[14ch] text-[clamp(36px,4vw,56px)] font-semibold leading-[1.0] tracking-[-0.03em]">
            Read the advert.{" "}
            <em className="not-italic text-[#E0480F] dark:text-[#FF5A1F]">
              Find the lead.
            </em>
          </h2>
          <p className={`mt-6 max-w-[44ch] text-[16px] leading-[1.6] ${SECONDARY}`}>
            Paste a competitor advert and Radar names the likely end client
            behind it — plus the contact worth approaching.
          </p>
        </div>
      </div>
    </div>
  );
}
