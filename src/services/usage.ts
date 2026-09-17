// Reads the current user's AI usage windows for the chat meter.
//
// Written only by the server (via the consume_ai_units RPC); RLS lets a user
// read their own two rows and nothing else.
import { supabase } from "@/lib/supabase";

export type WindowKind = "5h" | "week";

export type UsageWindow = {
  kind: WindowKind;
  used: number;
  cap: number;
  resetsAt: string;
};

export type UsageSnapshot = {
  fiveHour: UsageWindow;
  week: UsageWindow;
};

// Kept in sync with DEFAULT_LIMITS in usage.js. Used when the caps are not part
// of the row (the table stores counters, the caps live in app_settings).
export const DEFAULT_LIMITS: Record<"pro" | "free", Record<WindowKind, number>> = {
  pro: { "5h": 625_000, week: 5_000_000 },
  free: { "5h": 100_000, week: 500_000 },
};

export async function fetchUsage(
  userId: string,
  caps: Record<WindowKind, number>
): Promise<UsageSnapshot | null> {
  const { data, error } = await supabase
    .from("app_usage_windows")
    .select("window_kind, units, window_end")
    .eq("user_id", userId);

  if (error || !data) return null;

  const now = new Date().toISOString();
  const read = (kind: WindowKind): UsageWindow => {
    const row = data.find((r) => r.window_kind === kind);
    // An expired window has not been rolled yet (that happens on the next
    // request), so show it as already reset.
    const expired = !row || String(row.window_end) <= now;
    return {
      kind,
      used: expired ? 0 : Number(row?.units ?? 0),
      cap: caps[kind],
      resetsAt: expired ? now : String(row!.window_end),
    };
  };

  return { fiveHour: read("5h"), week: read("week") };
}

export const percentUsed = (w: UsageWindow) =>
  w.cap > 0 ? Math.min(100, Math.round((w.used / w.cap) * 100)) : 0;

// "4 hr 36 min" / "12 min" / "2 days 3 hr" — the time left on a window.
export function formatCountdown(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return "now";

  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;

  if (days > 0) return `${days} day${days > 1 ? "s" : ""}${hours ? ` ${hours} hr` : ""}`;
  if (hours > 0) return `${hours} hr${mins ? ` ${mins} min` : ""}`;
  return `${Math.max(1, mins)} min`;
}

// "14:30" / "Fri 14:30" — an absolute reset time, for when a countdown would
// be less useful than a clock time.
export function formatReset(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const soon = d.getTime() - Date.now() < 24 * 60 * 60 * 1000;
  return soon
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString([], {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
}

// Units are an internal accounting detail; the breakdown shows them compactly.
export const formatUnits = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
    : n >= 1_000
    ? `${Math.round(n / 1_000)}k`
    : String(n);
