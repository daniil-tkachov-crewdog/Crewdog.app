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

// "resets at 14:30" / "resets Fri 14:30" depending on how far out it is.
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
