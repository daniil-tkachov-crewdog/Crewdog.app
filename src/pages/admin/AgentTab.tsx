import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getSettings, saveSettings, type AgentConfig } from "@/services/settings";
import { toast } from "sonner";

const AgentTab = () => {
  const [enabled, setEnabled] = useState(false);
  const [cfg, setCfg] = useState<AgentConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setEnabled(s.agent_enabled);
      setCfg(s.agent_config ?? {});
      setLoading(false);
    })();
  }, []);

  const set = (k: keyof AgentConfig, v: string | number) =>
    setCfg((c) => ({ ...c, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await saveSettings({ agent_enabled: enabled, agent_config: cfg });
      toast.success("AI Agent settings saved");
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between max-w-xs">
        <span className="text-sm font-medium">Agent enabled</span>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>
      <p className="text-xs text-muted-foreground">
        When on, pasting a job description triggers the pipeline: extract company/title/location →
        verify company → LinkedIn X-ray for HR &amp; connections (via OpenAI web search).
      </p>

      <section className="space-y-2 max-w-xs">
        <label className="text-sm font-medium">Max contacts per search</label>
        <Input
          type="number"
          min={1}
          max={50}
          value={cfg.max_contacts ?? 8}
          onChange={(e) => set("max_contacts", Number(e.target.value))}
        />
      </section>

      <section className="space-y-2">
        <label className="text-sm font-medium">HR / recruiter role keywords</label>
        <Textarea
          value={cfg.hr_roles ?? ""}
          onChange={(e) => set("hr_roles", e.target.value)}
          rows={3}
          className="font-mono text-sm"
          placeholder='"recruiter", "talent acquisition", "hiring manager", "HR"'
        />
      </section>

      <section className="space-y-2">
        <label className="text-sm font-medium">Extraction prompt</label>
        <Textarea
          value={cfg.extract_instructions ?? ""}
          onChange={(e) => set("extract_instructions", e.target.value)}
          rows={4}
          className="font-mono text-sm"
        />
      </section>

      <section className="space-y-2">
        <label className="text-sm font-medium">Company verification prompt</label>
        <Textarea
          value={cfg.verify_instructions ?? ""}
          onChange={(e) => set("verify_instructions", e.target.value)}
          rows={4}
          className="font-mono text-sm"
        />
      </section>

      <section className="space-y-2">
        <label className="text-sm font-medium">LinkedIn search prompt</label>
        <Textarea
          value={cfg.search_instructions ?? ""}
          onChange={(e) => set("search_instructions", e.target.value)}
          rows={5}
          className="font-mono text-sm"
        />
      </section>

      <Button onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
};

export default AgentTab;
