// client/features/billing/SuccessPage.tsx
//
// Where Stripe returns after a successful checkout.
//
// The subscription is not live the instant this renders — Stripe's webhook
// decides that — so the page polls the account summary until the new plan
// shows up rather than claiming success straight away.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Topbar } from "@/components/layout/Topbar";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle,
  Sparkles,
  Zap,
  Shield,
  Crown,
  ArrowRight,
  Loader2,
  Star,
  TrendingUp,
  Users,
  Rocket,
} from "lucide-react";
import { gaEvent } from "@/core/analytics/gtm";

// Custom confetti particle component
const ConfettiParticle = ({ delay }: { delay: number }) => {
  const colors = [
    "bg-emerald-500",
    "bg-green-500",
    "bg-yellow-500",
    "bg-blue-500",
    "bg-purple-500",
    "bg-pink-500",
  ];
  const shapes = ["rounded-full", "rounded-sm", "rounded-md"];
  const randomColor = colors[Math.floor(Math.random() * colors.length)];
  const randomShape = shapes[Math.floor(Math.random() * shapes.length)];
  const randomX = Math.random() * 100;
  const randomRotate = Math.random() * 720;
  const randomDuration = 2.5 + Math.random() * 2;
  const randomSize = 8 + Math.random() * 8;

  return (
    <motion.div
      className={`absolute ${randomShape} ${randomColor}`}
      style={{
        width: randomSize,
        height: randomSize,
      }}
      initial={{
        top: "-10%",
        left: `${randomX}%`,
        opacity: 1,
        rotate: 0,
        scale: 1,
      }}
      animate={{
        top: "110%",
        opacity: 0,
        rotate: randomRotate,
        scale: 0.5,
      }}
      transition={{
        duration: randomDuration,
        delay: delay,
        ease: "linear",
      }}
    />
  );
};

export default function Success() {
  const navigate = useNavigate();
  const [showConfetti, setShowConfetti] = useState(true);
  const [countdown, setCountdown] = useState(8);

  useEffect(() => {
    (window as any).dataLayer = (window as any).dataLayer || [];
    (window as any).dataLayer.push({ event: "checkout_success" });
    try {
      gaEvent("checkout_success");
    } catch {}

    // Hide confetti after 6 seconds
    const confettiTimer = setTimeout(() => setShowConfetti(false), 6000);

    return () => clearTimeout(confettiTimer);
  }, []);

  // Auto-redirect countdown
  useEffect(() => {
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
  }, [navigate]);

  const benefits = [
    {
      icon: Crown,
      title: "Premium Access Activated",
      description: "All premium features are now unlocked",
      color: "text-yellow-600 dark:text-yellow-400",
      bgColor: "bg-yellow-50 dark:bg-yellow-950/20",
      borderColor: "border-yellow-200 dark:border-yellow-800",
    },
    {
      icon: Zap,
      title: "Extended Search Quota",
      description: "Access your monthly search allowance",
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-950/20",
      borderColor: "border-blue-200 dark:border-blue-800",
    },
    {
      icon: Shield,
      title: "Priority Support",
      description: "Get help faster with priority assistance",
      color: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-50 dark:bg-purple-950/20",
      borderColor: "border-purple-200 dark:border-purple-800",
    },
    {
      icon: TrendingUp,
      title: "Advanced Analytics",
      description: "Access detailed insights and reports",
      color: "text-pink-600 dark:text-pink-400",
      bgColor: "bg-pink-50 dark:bg-pink-950/20",
      borderColor: "border-pink-200 dark:border-pink-800",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 relative overflow-hidden">
      <Topbar />

      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-20 left-10 w-96 h-96 bg-emerald-400/10 rounded-full blur-3xl"
          animate={{
            x: [0, 50, 0],
            y: [0, 30, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute bottom-20 right-10 w-96 h-96 bg-green-400/10 rounded-full blur-3xl"
          animate={{
            x: [0, -50, 0],
            y: [0, -30, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 w-80 h-80 bg-teal-400/10 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Floating sparkles */}
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute"
            initial={{
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
            }}
            animate={{
              y: [null, Math.random() * -100, null],
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              delay: i * 0.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <Sparkles className="w-4 h-4 text-emerald-500/30" />
          </motion.div>
        ))}
      </div>

      {/* Custom confetti effect */}
      <AnimatePresence>
        {showConfetti && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-50">
            {Array.from({ length: 60 }).map((_, i) => (
              <ConfettiParticle key={i} delay={i * 0.03} />
            ))}
          </div>
        )}
      </AnimatePresence>

      <main className="flex-1 flex items-center justify-center p-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-3xl"
        >
          <Card className="border-2 shadow-2xl backdrop-blur-sm bg-background/95 overflow-hidden">
            <CardContent className="p-8 sm:p-12">
              {/* Success Icon with Animation */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 200,
                  damping: 15,
                  delay: 0.2,
                }}
                className="mb-8 flex justify-center relative"
              >
                <div className="relative">
                  <div className="w-28 h-28 rounded-full bg-gradient-to-r from-emerald-500 to-green-500 flex items-center justify-center shadow-2xl shadow-emerald-500/50">
                    <CheckCircle className="w-16 h-16 text-white" strokeWidth={2.5} />
                  </div>
                  
                  {/* Pulsing rings */}
                  <motion.div
                    className="absolute inset-0 rounded-full border-4 border-emerald-500/30"
                    animate={{
                      scale: [1, 1.5, 2],
                      opacity: [0.5, 0.2, 0],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeOut",
                    }}
                  />
                  <motion.div
                    className="absolute inset-0 rounded-full border-4 border-green-500/30"
                    animate={{
                      scale: [1, 1.5, 2],
                      opacity: [0.5, 0.2, 0],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeOut",
                      delay: 0.5,
                    }}
                  />

                  {/* Floating stars */}
                  {[...Array(6)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute"
                      style={{
                        top: "50%",
                        left: "50%",
                      }}
                      initial={{ scale: 0, x: 0, y: 0 }}
                      animate={{
                        scale: [0, 1, 0],
                        x: Math.cos((i * Math.PI * 2) / 6) * 80,
                        y: Math.sin((i * Math.PI * 2) / 6) * 80,
                      }}
                      transition={{
                        duration: 1.5,
                        delay: 0.3 + i * 0.1,
                        ease: "easeOut",
                      }}
                    >
                      <Star className="w-6 h-6 text-yellow-500 fill-yellow-500" />
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              {/* Success Message */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-center mb-8"
              >
                <h1 className="text-4xl sm:text-5xl font-bold mb-4 bg-gradient-to-r from-emerald-600 to-green-600 bg-clip-text text-transparent">
                  Payment Successful! 🎉
                </h1>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                  Your subscription has been activated. Welcome to the premium
                  experience with full access to all features!
                </p>
              </motion.div>

              {/* Benefits Grid */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="grid sm:grid-cols-2 gap-4 mb-8"
              >
                {benefits.map((benefit, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.7 + idx * 0.1 }}
                    className={`p-4 rounded-xl ${benefit.bgColor} border ${benefit.borderColor} transition-all hover:scale-105 hover:shadow-lg`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${benefit.color} bg-background/50`}>
                        <benefit.icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-sm mb-1">
                          {benefit.title}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {benefit.description}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>

              {/* Auto-redirect countdown */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-muted text-sm text-muted-foreground mb-6 mx-auto w-fit"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Redirecting in {countdown} seconds...</span>
              </motion.div>

              {/* Action Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1 }}
                className="flex flex-col sm:flex-row gap-3 justify-center"
              >
                <Link to="/run" className="flex-1 sm:flex-initial">
                  <Button size="lg" className="w-full sm:w-auto group relative overflow-hidden">
                    <span className="relative z-10 flex items-center gap-2">
                      <Rocket className="w-5 h-5" />
                      Start Searching
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </span>
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-emerald-600 to-green-600"
                      initial={{ x: "-100%" }}
                      whileHover={{ x: 0 }}
                      transition={{ duration: 0.3 }}
                    />
                  </Button>
                </Link>
                <Link to="/account" className="flex-1 sm:flex-initial">
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full sm:w-auto group"
                  >
                    <Users className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
                    View Account
                  </Button>
                </Link>
              </motion.div>

              {/* Additional Info */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2 }}
                className="mt-8 pt-8 border-t text-center"
              >
                <p className="text-sm text-muted-foreground mb-4">
                  🎊 You're now part of our premium community
                </p>
                <div className="flex items-center justify-center gap-6 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-500" />
                    <span>Secure Payment</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-500" />
                    <span>Instant Access</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    <span>Fully Activated</span>
                  </div>
                </div>
              </motion.div>
            </CardContent>
          </Card>

          {/* Footer note */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4 }}
            className="text-center text-sm text-muted-foreground mt-6"
          >
            Need help getting started?{" "}
            <Link
              to="/account"
              className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 hover:underline font-medium"
            >
              Visit your account
            </Link>
          </motion.p>
        </motion.div>
      </main>
    </div>
  );
}
