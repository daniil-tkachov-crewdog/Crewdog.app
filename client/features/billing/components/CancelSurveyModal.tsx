import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Shield } from "lucide-react";
import { sendCancelFeedback } from "@/features/billing/api/billing";
import { notify } from "@/core/notify/notify";

export default function CancelSurveyModal({
  open,
  onOpenChange,
  onContinue,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onContinue: () => void;
}) {
  const [reason, setReason] = useState("");
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);

  const handleContinue = async () => {
    if (!reason) return;
    setBusy(true);
    try {
      await sendCancelFeedback(
        reason,
        reason === "other" ? other.trim() : undefined
      );
      onOpenChange(false);
      onContinue();
    } catch (e: any) {
      notify(e?.message || "Couldn’t save feedback.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            We're sorry to see you go
          </DialogTitle>
          <DialogDescription>
            Help us improve by letting us know why you're cancelling
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={reason}
          onValueChange={setReason}
          className="space-y-3"
        >
          {[
            { value: "found_job", label: "I found a job" },
            { value: "price_high", label: "Too expensive" },
            { value: "irrelevant_results", label: "Results weren't relevant" },
            { value: "just_testing", label: "Just testing the service" },
            { value: "other", label: "Other" },
          ].map((r) => (
            <div
              key={r.value}
              className="flex items-center space-x-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <RadioGroupItem value={r.value} id={r.value} />
              <Label htmlFor={r.value} className="cursor-pointer flex-1">
                {r.label}
              </Label>
            </div>
          ))}
        </RadioGroup>

        <AnimatePresence>
          {reason === "other" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <Textarea
                placeholder="Please tell us more..."
                value={other}
                onChange={(e) => setOther(e.target.value)}
                className="mt-4"
              />
            </motion.div>
          )}
        </AnimatePresence>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Keep Subscription
          </Button>
          <Button
            variant="destructive"
            onClick={handleContinue}
            disabled={!reason || busy}
          >
            {busy ? "Saving…" : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
