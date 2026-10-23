import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Crown, Gift, Sparkles } from "lucide-react";
import {
  cancelSubscription,
  downgradeToRetentionPlan,
} from "@/features/billing/api/billing";
import { notify } from "@/core/notify/notify";
import { useState } from "react";

export default function DownsellModal({
  open,
  onOpenChange,
  onAccept,
  onCancelAnyway,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAccept: () => void;
  onCancelAnyway: () => void;
}) {
  const [busy, setBusy] = useState<"accept" | "cancel" | null>(null);

  const accept = async () => {
    setBusy("accept");
    try {
      await downgradeToRetentionPlan();

      // 🔹 UPDATED: be explicit that the change applies from the next cycle
      // notify(
      //   "Your plan will change to the £5/month retention plan from your next billing cycle. Your current credits stay the same for this period.",
      //   "success"
      // );

      onAccept();
      onOpenChange(false);
    } catch (e: any) {
      // Backend will return “Downgrade is only available for Platinum plan users.”
      // for non-platinum users – we just surface that nicely.
      notify(e?.message || "Plan change failed.", "error");
    } finally {
      setBusy(null);
    }
  };

  const cancelNow = async () => {
    setBusy("cancel");
    try {
      await cancelSubscription();
      notify(
        "Cancellation scheduled. You keep access and credits until your current period ends.",
        "success"
      );
      onCancelAnyway();
      onOpenChange(false);
    } catch (e: any) {
      notify(e?.message || "Cancel failed.", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            Special Offer – Retention Plan (£5/month)
          </DialogTitle>
          <DialogDescription>
            We'd love to keep you! Switch to our £5/month retention plan with a
            smaller bundle of searches. Your current cycle’s credits stay the
            same; the lower allowance only applies from your next billing
            period.
          </DialogDescription>
        </DialogHeader>

        <Card className="p-6 bg-gradient-to-br from-primary/10 via-purple-500/5 to-pink-500/5 border-primary/20">
          <div className="text-center">
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent"
            >
              £5/month
            </motion.div>
            <Badge variant="outline" className="mb-4">
              <Sparkles className="h-3 w-3 mr-1" />
              Limited time offer
            </Badge>
            <p className="text-sm text-muted-foreground">
              Keep access on a lighter plan while you’re not searching as much –
              with your current period’s credits untouched.
            </p>
          </div>
        </Card>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={cancelNow}
            disabled={busy !== null}
          >
            {busy === "cancel" ? "Cancelling…" : "Cancel Anyway"}
          </Button>
          <Button onClick={accept} className="flex-1" disabled={busy !== null}>
            <Crown className="mr-2 h-4 w-4" />
            {busy === "accept" ? "Applying…" : "Accept Offer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
