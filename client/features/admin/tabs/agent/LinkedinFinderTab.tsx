import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { AgentConfig } from "@/features/admin/api/settings";
import { LINKEDIN_FINDER_DEFAULTS as D } from "../../../../../server/agentPrompts.js";
import PromptField from "@/features/admin/tabs/agent/PromptField";

type Props = {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  cfg: AgentConfig;
  set: (k: keyof AgentConfig, v: string | number | string[]) => void;
};

// Workflow 2: a recruiter asks for people, and one prompt — this one — is sent
// with the conversation on every message about it.
const LinkedinFinderTab = ({ enabled, setEnabled, cfg, set }: Props) => (
  <div className="space-y-6">
    <div className="flex items-center justify-between max-w-xs">
      <span className="text-sm font-medium">Workflow enabled</span>
      <Switch checked={enabled} onCheckedChange={setEnabled} />
    </div>
    <p className="text-xs text-muted-foreground">
      When on, asking the chatbot to find people without a job description runs this prompt with
      a web search. The prompt is sent again on every follow-up about the same search
      (&ldquo;find more&rdquo;, &ldquo;none of these are good&rdquo;), and the search sees the whole
      chat history, so it carries the context itself.
    </p>

    <section className="space-y-2">
      <label className="text-sm font-medium">Prompt</label>
      <Textarea
        value={cfg.linkedin_finder_prompt ?? D.linkedin_finder_prompt}
        onChange={(e) => set("linkedin_finder_prompt", e.target.value)}
        rows={14}
        className="font-mono text-sm"
      />
      <p className="text-xs text-muted-foreground">
        Explain the task in plain words. The answer format below is sent with it.
      </p>
    </section>

    <PromptField
      label="Answer format"
      hint="The JSON the result cards are built from, and the one-entry-per-person rule. Rename a field and the cards stop finding it."
      value={cfg.linkedin_finder_output_contract}
      fallback={D.linkedin_finder_output_contract}
      onChange={(v) => set("linkedin_finder_output_contract", v)}
      rows={10}
    />
    <PromptField
      label="Message sent with each search"
      hint="Goes after the conversation, as the last thing the search reads."
      placeholders={["request", "today", "output_contract"]}
      value={cfg.linkedin_finder_run_instruction}
      fallback={D.linkedin_finder_run_instruction}
      onChange={(v) => set("linkedin_finder_run_instruction", v)}
      rows={5}
    />
  </div>
);

export default LinkedinFinderTab;
