// client/features/admin/tabs/agent/JobDescriptionTab.tsx
//
// Prompt editor for the job-description workflow — the four-stage one that
// extracts the company from a pasted advert, verifies it, then X-rays
// LinkedIn for HR contacts and connections. One field per stage.

import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { AgentConfig } from "@/features/admin/api/settings";
import { JOB_DESCRIPTION_DEFAULTS as D } from "../../../../../server/agentPrompts.js";
import PromptField from "@/features/admin/tabs/agent/PromptField";

type Props = {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  cfg: AgentConfig;
  set: (k: keyof AgentConfig, v: string | number | string[]) => void;
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
        value={cfg.max_contacts ?? D.max_contacts}
        onChange={(e) => set("max_contacts", Number(e.target.value))}
      />
    </section>

    <section className="space-y-2">
      <label className="text-sm font-medium">HR / recruiter role keywords</label>
      <Textarea
        value={cfg.hr_roles ?? D.hr_roles}
        onChange={(e) => set("hr_roles", e.target.value)}
        rows={3}
        className="font-mono text-sm"
      />
    </section>

    <section className="space-y-2">
      <label className="text-sm font-medium">Extraction prompt</label>
      <Textarea
        value={cfg.extract_instructions ?? D.extract_instructions}
        onChange={(e) => set("extract_instructions", e.target.value)}
        rows={13}
        className="font-mono text-sm"
      />
    </section>

    <section className="space-y-2">
      <label className="text-sm font-medium">Company verification prompt</label>
      <Textarea
        value={cfg.verify_instructions ?? D.verify_instructions}
        onChange={(e) => set("verify_instructions", e.target.value)}
        rows={13}
        className="font-mono text-sm"
      />
    </section>

    <section className="space-y-2">
      <label className="text-sm font-medium">LinkedIn search prompt</label>
      <Textarea
        value={cfg.search_instructions ?? D.search_instructions}
        onChange={(e) => set("search_instructions", e.target.value)}
        rows={15}
        className="font-mono text-sm"
      />
    </section>

    <section className="space-y-1 pt-2">
      <h3 className="text-sm font-semibold">The messages each stage sends</h3>
      <p className="text-xs text-muted-foreground">
        The prompts above are the instructions for each stage; these are the messages that carry
        this particular job description into them, and the JSON each stage must answer with. Change
        a field name here and the stage after it stops finding it.
      </p>
    </section>

    <PromptField
      label="Stage 1 — extract, message"
      placeholders={["job_description"]}
      value={cfg.extract_input}
      fallback={D.extract_input}
      onChange={(v) => set("extract_input", v)}
      rows={6}
    />
    <PromptField
      label="Stage 2 — verify company, message"
      placeholders={["company", "location"]}
      value={cfg.verify_input}
      fallback={D.verify_input}
      onChange={(v) => set("verify_input", v)}
      rows={6}
    />
    <PromptField
      label="Stage 3 — LinkedIn search, message"
      placeholders={["max_contacts", "hr_roles", "company", "title", "location"]}
      value={cfg.search_input}
      fallback={D.search_input}
      onChange={(v) => set("search_input", v)}
      rows={9}
    />
  </div>
);

export default JobDescriptionTab;
