// Compact AI-allowance meter for the chat header: 5-hour window in front,
// weekly window behind it. Mirrors the refresh behaviour of QuotaBadge.
import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { fetchAccountSummary } from "@/services/account";
import { getSettings } from "@/services/settings";
import {
  fetchUsage,
  formatReset,
  percentUsed,
  DEFAULT_LIMITS,
  type UsageSnapshot,
  type WindowKind,
} from "@/services/usage";

type Props = { refreshKey?: number };

const UsageMeter: React.FC<Props> = ({ refreshKey = 0 }) => {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = React.useState<UsageSnapshot | null>(null);
  const [pro, setPro] = React.useState(false);
  const [admin, setAdmin] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!user?.id) return;
    try {
      const [summary, settings] = await Promise.all([
        fetchAccountSummary(),
        getSettings(),
      ]);
      const isAdmin = summary.isAdmin === true;
      const isPro = isAdmin || summary.pro || summary.unlimited;
      setAdmin(isAdmin);
      setPro(isPro);
      if (isAdmin) return; // admins are exempt from the limits entirely

      const tier = isPro ? "pro" : "free";
      const override = settings.usage_limits?.[tier] ?? {};
      const caps: Record<WindowKind, number> = {
        "5h": override.five_hour ?? DEFAULT_LIMITS[tier]["5h"],
        week: override.week ?? DEFAULT_LIMITS[tier].week,
      };
      setSnapshot(await fetchUsage(user.id, caps));
    } catch {
      /* the meter is informational — stay quiet on failure */
    }
  }, [user?.id]);

  React.useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  React.useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refresh]);

  if (admin || !snapshot) return null;

  const { fiveHour, week } = snapshot;
  const pctFive = percentUsed(fiveHour);
  const pctWeek = percentUsed(week);
  // Nothing to say until the user is actually getting somewhere.
  if (pctFive < 20 && pctWeek < 50) return null;

  const tight = pctFive >= 90 || pctWeek >= 90;
  const bar = tight
    ? "bg-[#E0480F] dark:bg-[#FF5A1F]"
    : "bg-[#6E6B64] dark:bg-[#96938C]";

  return (
    <div className="flex items-center gap-2 text-[12px] text-[#6E6B64] dark:text-[#96938C]">
      <div className="h-[5px] w-16 overflow-hidden rounded-full bg-[rgba(26,25,23,0.1)] dark:bg-[rgba(255,255,255,0.14)]">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pctFive}%` }} />
      </div>
      <span className="whitespace-nowrap">
        {pctFive}% of 5-hour limit · resets {formatReset(fiveHour.resetsAt)}
      </span>
      {pctWeek >= 50 && (
        <span className="hidden whitespace-nowrap sm:inline">
          · {pctWeek}% of weekly
        </span>
      )}
      {!pro && tight && (
        <Link to="/pricing" className="whitespace-nowrap underline">
          Upgrade
        </Link>
      )}
    </div>
  );
};

export default UsageMeter;
