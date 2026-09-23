import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { AgentConfig } from "@/services/settings";
import { LINKEDIN_FINDER_DEFAULTS as D } from "../../../../agentPrompts.js";

type Props = {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  cfg: AgentConfig;
  set: (k: keyof AgentConfig, v: string | number) => void;
};

// Workflow 2: no job description — a recruiter asks for professionals by title
// and location, and we search LinkedIn, verify each hit, and hand back links.
const LinkedinFinderTab = ({ enabled, setEnabled, cfg, set }: Props) => (
  <div className="space-y-6">
    <div className="flex items-center justify-between max-w-xs">
      <span className="text-sm font-medium">Workflow enabled</span>
      <Switch checked={enabled} onCheckedChange={setEnabled} />
    </div>
    <p className="text-xs text-muted-foreground">
      When on, asking the chatbot to find professionals without a job description triggers the
      pipeline: job title + location (+ any key factors the user adds) → LinkedIn-domain web
      search → dedupe → an AI pass that verifies each profile against every key factor → a
      compact list of profile links. The chatbot asks for the title or location when either is
      missing rather than guessing.
    </p>

    <div className="flex gap-4">
      <section className="space-y-2 max-w-[10rem]">
        <label className="text-sm font-medium">Max links</label>
        <Input
          type="number"
          min={1}
          max={50}
          value={cfg.finder_max_results ?? D.finder_max_results}
          onChange={(e) => set("finder_max_results", Number(e.target.value))}
        />
      </section>

      <section className="space-y-2 max-w-[10rem]">
        <label className="text-sm font-medium">Min confidence</label>
        <Input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={cfg.finder_min_confidence ?? D.finder_min_confidence}
          onChange={(e) => set("finder_min_confidence", Number(e.target.value))}
        />
      </section>
    </div>
    <p className="text-xs text-muted-foreground -mt-4">
      Max links caps the whole pipeline — how many profile links are searched for, run through
      verification, and shown to the user. Raising it costs proportionally more tokens per
      search. Profiles the verification step scores below the minimum confidence are dropped, so
      a run can return fewer links than the cap.
    </p>

    <section className="space-y-2">
      <label className="text-sm font-medium">Key factor hints</label>
      <Textarea
        value={cfg.finder_extra_factor_hints ?? D.finder_extra_factor_hints}
        onChange={(e) => set("finder_extra_factor_hints", e.target.value)}
        rows={2}
        className="font-mono text-sm"
      />
    </section>

    <section className="space-y-2">
      <label className="text-sm font-medium">Search prompt</label>
      <Textarea
        value={cfg.finder_search_instructions ?? D.finder_search_instructions}
        onChange={(e) => set("finder_search_instructions", e.target.value)}
        rows={16}
        className="font-mono text-sm"
      />
    </section>

    <section className="space-y-2">
      <label className="text-sm font-medium">Verification prompt</label>
      <Textarea
        value={cfg.finder_verify_instructions ?? D.finder_verify_instructions}
        onChange={(e) => set("finder_verify_instructions", e.target.value)}
        rows={18}
        className="font-mono text-sm"
      />
    </section>

    <section className="space-y-2">
      <label className="text-sm font-medium">Presentation prompt</label>
      <Textarea
        value={cfg.finder_compress_instructions ?? D.finder_compress_instructions}
        onChange={(e) => set("finder_compress_instructions", e.target.value)}
        rows={9}
        className="font-mono text-sm"
      />
    </section>
  </div>
);

export default LinkedinFinderTab;
