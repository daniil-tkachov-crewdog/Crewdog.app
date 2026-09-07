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

const ApiTab = () => {
  const [model, setModel] = useState<string>("");
  const [webSearch, setWebSearch] = useState(false);
  const [fileSearch, setFileSearch] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsagePoint[]>([]);
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

  // Live token usage polling.
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.rpc("admin_token_usage", { hours: 24 });
      setUsage(
        ((data as UsagePoint[]) ?? []).map((d) => ({
          ...d,
          bucket: new Date(d.bucket).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        }))
      );
    };
    load();
    timer.current = setInterval(load, REFRESH_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

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
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium">Token usage (last 24h)</h2>
          <span className="text-xs text-muted-foreground">
            {totalTokens.toLocaleString()} tokens · live
          </span>
        </div>
        <div className="h-64 rounded-md border p-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={usage}>
              <defs>
                <linearGradient id="tok" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#16a34a" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="bucket" fontSize={11} />
              <YAxis fontSize={11} width={48} />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="total_tokens"
                stroke="#16a34a"
                fill="url(#tok)"
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
