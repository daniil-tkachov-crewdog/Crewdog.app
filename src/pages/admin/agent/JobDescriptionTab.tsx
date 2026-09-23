import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { AgentConfig } from "@/services/settings";

type Props = {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  cfg: AgentConfig;
  set: (k: keyof AgentConfig, v: string | number) => void;
};

// Workflow 1: the user pastes a job description and we surface the HR
// contacts and connections behind that specific opening.
const JobDescriptionTab = ({ enabled, setEnabled, cfg, set }: Props) => (
  <div className="space-y-6">
    <div className="flex items-center justify-between max-w-xs">
      <span className="text-sm font-medium">Workflow enabled</span>
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
  </div>
);

export default JobDescriptionTab;
