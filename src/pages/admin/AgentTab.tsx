import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getSettings, saveSettings, type AgentConfig } from "@/services/settings";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import JobDescriptionTab from "./agent/JobDescriptionTab";
import LinkedinFinderTab from "./agent/LinkedinFinderTab";
import JobFinderTab from "./agent/JobFinderTab";
import AccommodationFinderTab from "./agent/AccommodationFinderTab";

const WORKFLOWS = [
  { key: "jd", label: "Job description" },
  { key: "finder", label: "LinkedIn finder" },
  { key: "jobfinder", label: "Job finder" },
  { key: "accommodation", label: "Accommodation Finder" },
] as const;

type WorkflowKey = (typeof WORKFLOWS)[number]["key"];

// Shell for the agent workflows. They all live in the same app_settings row, so
// settings load once here and a single Save persists whichever sub-tab was edited.
const AgentTab = () => {
  const [workflow, setWorkflow] = useState<WorkflowKey>("jd");
  const [enabled, setEnabled] = useState(false);
  const [finderEnabled, setFinderEnabled] = useState(false);
  const [jobFinderEnabled, setJobFinderEnabled] = useState(false);
  const [accomFinderEnabled, setAccomFinderEnabled] = useState(false);
  const [lushaEnabled, setLushaEnabled] = useState(false);
  const [cfg, setCfg] = useState<AgentConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setEnabled(s.agent_enabled);
      setFinderEnabled(s.linkedin_finder_enabled);
      setJobFinderEnabled(s.job_finder_enabled);
      setAccomFinderEnabled(s.accommodation_finder_enabled);
      setLushaEnabled(s.lusha_enabled);
      setCfg(s.agent_config ?? {});
      setLoading(false);
    })();
  }, []);

  const set = (k: keyof AgentConfig, v: string | number | boolean | string[]) =>
    setCfg((c) => ({ ...c, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await saveSettings({
        agent_enabled: enabled,
        linkedin_finder_enabled: finderEnabled,
        job_finder_enabled: jobFinderEnabled,
        accommodation_finder_enabled: accomFinderEnabled,
        lusha_enabled: lushaEnabled,
        agent_config: cfg,
      });
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
      <section className="rounded-lg border p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Contact lookup (Lusha)</span>
          <Switch checked={lushaEnabled} onCheckedChange={setLushaEnabled} />
        </div>
        <p className="text-xs text-muted-foreground">
          Adds &ldquo;Check phone number&rdquo; and &ldquo;Check email&rdquo; to every LinkedIn
          person card. Nothing is looked up during a search — only a click on one card calls
          Lusha, and only for the one datapoint clicked. Lusha bills per revealed datapoint, so
          each first click on a profile costs credits; answers are cached and shared, so repeats
          are free. Off means the buttons are hidden and the server refuses the call.
        </p>
      </section>

      <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
        {WORKFLOWS.map((w) => (
          <button
            key={w.key}
            onClick={() => setWorkflow(w.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              workflow === w.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>

      {workflow === "jd" && (
        <JobDescriptionTab enabled={enabled} setEnabled={setEnabled} cfg={cfg} set={set} />
      )}
      {workflow === "finder" && (
        <LinkedinFinderTab
          enabled={finderEnabled}
          setEnabled={setFinderEnabled}
          cfg={cfg}
          set={set}
        />
      )}
      {workflow === "jobfinder" && (
        <JobFinderTab
          enabled={jobFinderEnabled}
          setEnabled={setJobFinderEnabled}
          cfg={cfg}
          set={set}
        />
      )}
      {workflow === "accommodation" && (
        <AccommodationFinderTab
          enabled={accomFinderEnabled}
          setEnabled={setAccomFinderEnabled}
          cfg={cfg}
          set={set}
        />
      )}

      <Button onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
};

export default AgentTab;
