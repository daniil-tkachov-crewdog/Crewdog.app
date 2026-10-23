import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import type { ActivityItem } from "@/data/account.types";

export default function ActivityLog({ items }: { items: ActivityItem[] }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-6">
        <svg className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none">
          <path d="M3 3v18h18" stroke="currentColor" strokeWidth="2" />
        </svg>
        <h2 className="text-2xl font-bold">Recent Activity</h2>
      </div>
      <Card className="p-6 glass-card">
        <div className="space-y-4">
          {items.map((i, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="flex items-center gap-4 p-4 rounded-lg hover:bg-muted/50 transition-colors group"
            >
              <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <i.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium">{i.action}</p>
                <p className="text-sm text-muted-foreground">{i.time}</p>
              </div>
              <svg
                className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100"
                viewBox="0 0 24 24"
                fill="none"
              >
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" />
              </svg>
            </motion.div>
          ))}
        </div>
      </Card>
    </section>
  );
}
