import { useState } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Bell, Gift, Mail } from "lucide-react";
import { toast } from "sonner";

export default function NotificationsSection() {
  const [email, setEmail] = useState(true);
  const [push, setPush] = useState(true);
  const [marketing, setMarketing] = useState(false);

  const items = [
    {
      label: "Email Notifications",
      description: "Receive updates about your job searches",
      checked: email,
      set: setEmail,
      icon: Mail,
    },
    {
      label: "Push Notifications",
      description: "Get notified about new opportunities",
      checked: push,
      set: setPush,
      icon: Bell,
    },
    {
      label: "Marketing Emails",
      description: "Receive promotional content and offers",
      checked: marketing,
      set: setMarketing,
      icon: Gift,
    },
  ];

  return (
    <section>
      <div className="flex items-center gap-2 mb-6">
        <Bell className="h-5 w-5 text-primary" />
        <h2 className="text-2xl font-bold">Notifications</h2>
      </div>

      <Card className="p-6 glass-card space-y-6">
        {items.map((it, idx) => (
          <motion.div
            key={it.label}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="flex items-center justify-between p-4 rounded-lg hover:bg-muted/50 transition-colors group"
          >
            <div className="flex items-center gap-4">
              <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <it.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">{it.label}</p>
                <p className="text-sm text-muted-foreground">
                  {it.description}
                </p>
              </div>
            </div>
            <Switch
              checked={it.checked}
              onCheckedChange={(v) => {
                it.set(v);
                toast.success(`${it.label} ${v ? "enabled" : "disabled"}`);
              }}
            />
          </motion.div>
        ))}
      </Card>
    </section>
  );
}
