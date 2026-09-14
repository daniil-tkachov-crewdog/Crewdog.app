import { useEffect, useRef, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabase";
import { getSettings, saveSettings } from "@/services/settings";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type UsagePoint = {
  bucket: string;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
};

const REFRESH_MS = 5000;

const RANGES = [
  { key: "24h", label: "24 hours" },
  { key: "7d", label: "7 days" },
  { key: "1m", label: "1 month" },
  { key: "6m", label: "6 months" },
  { key: "12m", label: "12 months" },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

// Axis/tooltip label formatting per range.
const formatBucket = (iso: string, range: RangeKey) => {
  const d = new Date(iso);
  if (range === "24h")
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (range === "7d" || range === "1m" || range === "6m")
    return d.toLocaleDateString([], { day: "2-digit", month: "short" });
  return d.toLocaleDateString([], { month: "short", year: "2-digit" });
};

const ApiTab = () => {
  const [model, setModel] = useState<string>("");
  const [webSearch, setWebSearch] = useState(false);
  const [fileSearch, setFileSearch] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsagePoint[]>([]);
  const [range, setRange] = useState<RangeKey>("24h");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initial load: settings + model list.
  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setModel(s.chat_model);
      setWebSearch(s.web_search);
      setFileSearch(s.file_search);

      try {
        const r = await fetch("/api/models");
        const d = await r.json();
        const list: string[] = d?.models ?? [];
        // Make sure the current selection is always present.
        setModels(Array.from(new Set([s.chat_model, ...list])).filter(Boolean));
      } catch {
        setModels([s.chat_model].filter(Boolean));
      }
    })();
  }, []);

  // Live token usage polling (re-runs when the range changes).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.rpc("admin_token_usage", { range_key: range });
      if (!cancelled) setUsage((data as UsagePoint[]) ?? []);
    };
    load();
    timer.current = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
    };
  }, [range]);

  const persist = async (patch: Parameters<typeof saveSettings>[0], label: string) => {
    setSaving(label);
    try {
      await saveSettings(patch);
    } finally {
      setSaving(null);
    }
  };

  const totalTokens = usage.reduce((a, b) => a + (b.total_tokens ?? 0), 0);

  return (
    <div className="max-w-3xl space-y-8">
      {/* Model */}
      <section className="space-y-2">
        <label className="text-sm font-medium">ChatGPT model</label>
        <Select
          value={model}
          onValueChange={(v) => {
            setModel(v);
            persist({ chat_model: v }, "model");
          }}
        >
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Select a model" />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Used for all chats, for every user.{saving === "model" ? " Saving…" : ""}
        </p>
      </section>

      {/* Toggles */}
      <section className="space-y-4">
        <div className="flex items-center justify-between max-w-xs">
          <span className="text-sm font-medium">Web Search</span>
          <Switch
            checked={webSearch}
            onCheckedChange={(v) => {
              setWebSearch(v);
              persist({ web_search: v }, "web");
            }}
          />
        </div>
        <div className="flex items-center justify-between max-w-xs">
          <span className="text-sm font-medium">File Search</span>
          <Switch
            checked={fileSearch}
            onCheckedChange={(v) => {
              setFileSearch(v);
              persist({ file_search: v }, "file");
            }}
          />
        </div>
      </section>

      {/* Token usage graph */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">Token usage</h2>
          <span className="text-xs text-muted-foreground">
            {totalTokens.toLocaleString()} tokens · live
          </span>
        </div>

        {/* Range filters */}
        <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                range === r.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="h-72 rounded-xl border p-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={usage} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="tok" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#16a34a" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                strokeDasharray="4 4"
                className="stroke-muted"
              />
              <XAxis
                dataKey="bucket"
                tickFormatter={(v) => formatBucket(v, range)}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
                tickMargin={8}
              />
              <YAxis
                fontSize={11}
                width={52}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) =>
                  v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(v)
                }
              />
              <Tooltip
                labelFormatter={(v) => formatBucket(String(v), range)}
                formatter={(v: number) => [v.toLocaleString(), "Tokens"]}
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--background))",
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="total_tokens"
                stroke="#16a34a"
                strokeWidth={2.5}
                fill="url(#tok)"
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls
                isAnimationActive
                animationDuration={500}
                name="Total tokens"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
};

export default ApiTab;
