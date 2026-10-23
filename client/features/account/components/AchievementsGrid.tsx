import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import type { Achievement } from "@/features/account/fixtures/account.types";

export default function AchievementsGrid({
  achievements,
}: {
  achievements: Achievement[];
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-6">
        <svg className="h-5 w-5 text-primary" viewBox="0 0 24 24" fill="none">
          <path
            d="M8 21l4-2 4 2V7H8v14z"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
        <h3 className="text-2xl font-bold">Achievements</h3>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {achievements.map((a, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card
              className={`p-4 glass-card ${
                a.unlocked
                  ? "border-primary/50 bg-primary/5"
                  : "opacity-50 grayscale"
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`p-3 rounded-xl ${
                    a.unlocked
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <a.icon className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold mb-1">{a.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    {a.description}
                  </p>
                </div>
                {a.unlocked && (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                )}
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
