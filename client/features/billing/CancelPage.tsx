// client/features/billing/CancelPage.tsx
//
// Where Stripe returns when a checkout is abandoned. Nothing was charged and
// nothing changed; the page exists so the return is not a dead end.

import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Topbar } from "@/components/layout/Topbar";
import { motion } from "framer-motion";
import { XCircle } from "lucide-react";
import { gaEvent } from "@/core/analytics/gtm";

export default function Cancel() {
  useEffect(() => {
    (window as any).dataLayer = (window as any).dataLayer || [];
    (window as any).dataLayer.push({ event: "checkout_cancel" });
    try {
      gaEvent("checkout_cancel");
    } catch {}
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Topbar />

      <main className="flex-1 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-lg"
        >
          <Card className="p-12 text-center glass-card">
            <div className="mb-6 flex justify-center">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                <XCircle className="h-8 w-8 text-muted-foreground" />
              </div>
            </div>

            <h1 className="text-3xl font-bold mb-4">Payment Cancelled</h1>
            <p className="text-lg text-muted-foreground mb-8">
              Your payment was cancelled. No charges have been made to your
              account.
            </p>

            <div className="space-y-3">
              <Link to="/pricing" className="block">
                <Button size="lg" className="w-full magnetic-button">
                  View Plans
                </Button>
              </Link>
              <Link to="/run" className="block">
                <Button size="lg" variant="outline" className="w-full">
                  Continue with Free Plan
                </Button>
              </Link>
            </div>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}
