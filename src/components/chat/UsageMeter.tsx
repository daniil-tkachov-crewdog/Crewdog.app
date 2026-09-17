// AI allowance popover for the chat header, modelled on Claude's usage panel:
// a compact trigger, then a panel with a bar per rolling window, a live
// countdown to each reset, and an expandable breakdown.
import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Gauge } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { fetchAccountSummary } from "@/services/account";
import { getSettings } from "@/services/settings";
import {
  fetchUsage,
  formatCountdown,
  formatReset,
  formatUnits,
  percentUsed,
  DEFAULT_LIMITS,
  type UsageSnapshot,
  type UsageWindow,
  type WindowKind,
} from "@/services/usage";

type Props = { refreshKey?: number };

// Re-render once a minute so the countdowns stay honest without a timer per bar.
const useMinuteTick = (active: boolean) => {
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [active]);
};

const barColor = (pct: number) =>
  pct >= 90
    ? "bg-[#E0480F] dark:bg-[#FF5A1F]"
    : pct >= 70
    ? "bg-[#D08B2C] dark:bg-[#E8A33D]"
    : "bg-[#3B82F6] dark:bg-[#5B9BFF]";

const WindowRow: React.FC<{ label: string; window: UsageWindow }> = ({
  label,
  window: w,
}) => {
  const pct = percentUsed(w);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-[#1A1917] dark:text-[#ECEBE8]">
          {label}
        </span>
        <span className="flex items-baseline gap-2 text-[12px] text-[#6E6B64] dark:text-[#96938C]">
          <span>Resets in {formatCountdown(w.resetsAt)}</span>
          <span className="tabular-nums font-medium text-[#1A1917] dark:text-[#ECEBE8]">
            {pct}%
          </span>
        </span>
      </div>
      <div className="h-[5px] w-full overflow-hidden rounded-full bg-[rgba(26,25,23,0.1)] dark:bg-[rgba(255,255,255,0.14)]">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${barColor(pct)}`}
          style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }}
        />
      </div>
    </div>
  );
};

const UsageMeter: React.FC<Props> = ({ refreshKey = 0 }) => {
  const { user } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [detailed, setDetailed] = React.useState(false);
  const [snapshot, setSnapshot] = React.useState<UsageSnapshot | null>(null);
  const [pro, setPro] = React.useState(false);

  useMinuteTick(open);

  const refresh = React.useCallback(async () => {
    if (!user?.id) return;

    // The plan and the caps are looked up on a best-effort basis: the billing
    // backend is a separate service that can be cold-starting or down, and
    // getSettings() hits the network too. Neither is allowed to take the meter
    // down with it — a wrong cap is a cosmetic problem, a missing meter is the
    // bug this component exists to avoid.
    const [summary, settings] = await Promise.all([
      fetchAccountSummary().catch(() => null),
      getSettings().catch(() => null),
    ]);

    // Admins get Pro-sized allowances, but they are still metered and still see
    // the meter: the server counts everyone, so hiding it here would only make
    // the numbers invisible, not absent.
    const isPro =
      summary?.isAdmin === true || !!summary?.pro || !!summary?.unlimited;
    setPro(isPro);

    const tier = isPro ? "pro" : "free";
    const override = settings?.usage_limits?.[tier] ?? {};
    const caps: Record<WindowKind, number> = {
      "5h": override.five_hour ?? DEFAULT_LIMITS[tier]["5h"],
      week: override.week ?? DEFAULT_LIMITS[tier].week,
    };

    try {
      setSnapshot(await fetchUsage(user.id, caps));
    } catch {
      /* counters unreadable — leave whatever was last shown */
    }
  }, [user?.id]);

  React.useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  // Re-read when the panel is opened and when the tab regains focus, so the
  // numbers are never stale at the moment someone actually looks at them.
  React.useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  React.useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refresh]);

  if (!snapshot) return null;

  const { fiveHour, week } = snapshot;
  const pctFive = percentUsed(fiveHour);
  const pctWeek = percentUsed(week);
  const peak = Math.max(pctFive, pctWeek);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label="AI usage limits"
          className="flex items-center gap-2 rounded-[9px] px-2 py-1.5 text-[12px] text-[#6E6B64] transition hover:bg-[rgba(26,25,23,0.05)] dark:text-[#96938C] dark:hover:bg-[rgba(255,255,255,0.07)]"
        >
          <Gauge className="h-[14px] w-[14px]" />
          <div className="hidden h-[5px] w-14 overflow-hidden rounded-full bg-[rgba(26,25,23,0.1)] sm:block dark:bg-[rgba(255,255,255,0.14)]">
            <div
              className={`h-full rounded-full ${barColor(peak)}`}
              style={{ width: `${Math.max(peak, peak > 0 ? 2 : 0)}%` }}
            />
          </div>
          <span className="tabular-nums">{peak}%</span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-[320px] p-0">
        <div className="space-y-4 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-medium text-[#6E6B64] dark:text-[#96938C]">
              Usage limits
            </span>
            <span className="text-[12px] text-[#6E6B64] dark:text-[#96938C]">
              {pro ? "Pro" : "Free"}
            </span>
          </div>

          <WindowRow label="5-hour limit" window={fiveHour} />
          <WindowRow label="Weekly limit" window={week} />

          <button
            onClick={() => setDetailed((v) => !v)}
            className="flex w-full items-center justify-between text-[12px] text-[#6E6B64] transition hover:text-[#1A1917] dark:text-[#96938C] dark:hover:text-[#ECEBE8]"
          >
            <span>See detailed breakdown</span>
            <ChevronRight
              className={`h-[14px] w-[14px] transition-transform ${
                detailed ? "rotate-90" : ""
              }`}
            />
          </button>

          {detailed && (
            <div className="space-y-2 border-t border-[rgba(26,25,23,0.1)] pt-3 text-[12px] text-[#6E6B64] dark:border-[rgba(255,255,255,0.12)] dark:text-[#96938C]">
              {(
                [
                  ["5-hour", fiveHour],
                  ["Weekly", week],
                ] as const
              ).map(([label, w]) => (
                <div key={label} className="flex justify-between gap-3">
                  <span>{label}</span>
                  <span className="tabular-nums">
                    {formatUnits(w.used)} / {formatUnits(w.cap)} · resets{" "}
                    {formatReset(w.resetsAt)}
                  </span>
                </div>
              ))}
              <p className="pt-1 leading-[1.5]">
                Measured in input-equivalent units, so a long answer counts for
                more than a long question.
              </p>
            </div>
          )}

          {!pro && (
            <Link
              to="/pricing"
              onClick={() => setOpen(false)}
              className="block rounded-[9px] bg-[#E0480F] px-3 py-2 text-center text-[13px] font-medium text-white transition hover:opacity-90 dark:bg-[#FF5A1F] dark:text-[#0B0B0F]"
            >
              Upgrade for a larger allowance
            </Link>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default UsageMeter;
