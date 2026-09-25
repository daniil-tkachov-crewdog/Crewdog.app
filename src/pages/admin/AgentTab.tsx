import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getSettings, saveSettings, type AgentConfig } from "@/services/settings";
import { toast } from "sonner";
import JobDescriptionTab from "./agent/JobDescriptionTab";
import LinkedinFinderTab from "./agent/LinkedinFinderTab";
import JobFinderTab from "./agent/JobFinderTab";

const WORKFLOWS = [
  { key: "jd", label: "Job description" },
  { key: "finder", label: "LinkedIn finder" },
  { key: "jobfinder", label: "Job finder" },
] as const;

type WorkflowKey = (typeof WORKFLOWS)[number]["key"];

// Shell for the agent workflows. They all live in the same app_settings row, so
// settings load once here and a single Save persists whichever sub-tab was edited.
const AgentTab = () => {
  const [workflow, setWorkflow] = useState<WorkflowKey>("jd");
  const [enabled, setEnabled] = useState(false);
  const [finderEnabled, setFinderEnabled] = useState(false);
  const [jobFinderEnabled, setJobFinderEnabled] = useState(false);
  const [cfg, setCfg] = useState<AgentConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await getSettings();
      setEnabled(s.agent_enabled);
      setFinderEnabled(s.linkedin_finder_enabled);
      setJobFinderEnabled(s.job_finder_enabled);
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

      <Button onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
};

export default AgentTab;
