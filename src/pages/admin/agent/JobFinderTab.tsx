import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { AgentConfig } from "@/services/settings";
import { JOB_FINDER_DEFAULTS as D } from "../../../../server/agentPrompts.js";
import PromptField from "./PromptField";

type Props = {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  cfg: AgentConfig;
  set: (k: keyof AgentConfig, v: string | number | boolean | string[]) => void;
};

// Workflow 3: a candidate asks for work, and one prompt — this one — is sent
// with the conversation on every message about it.
const JobFinderTab = ({ enabled, setEnabled, cfg, set }: Props) => {
  const includeAgencies = cfg.jobfinder_include_agencies ?? D.jobfinder_include_agencies;
  const verifyLinks = cfg.jobfinder_verify_links ?? D.jobfinder_verify_links;

  return (
  <div className="space-y-6">
    <div className="flex items-center justify-between max-w-xs">
      <span className="text-sm font-medium">Workflow enabled</span>
      <Switch checked={enabled} onCheckedChange={setEnabled} />
    </div>
    <p className="text-xs text-muted-foreground">
      When on, asking the chatbot for work runs this prompt with a web search. The prompt is sent
      again on every follow-up about the same search (&ldquo;any more?&rdquo;, &ldquo;somewhere
      closer&rdquo;), and the search sees the whole chat history, so it carries the context itself.
      Adverts on the employer&rsquo;s own site are shown above the boards and agencies.
    </p>

    <section className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="text-sm font-medium">Show recruitment agencies?</span>
          <p className="text-xs text-muted-foreground">
            On: job boards, recruitment platforms and agency listings are searched alongside the
            companies&rsquo; own career pages. Off: only adverts on the hiring company&rsquo;s own
            website, which is a much shorter list.
          </p>
        </div>
        <Switch
          checked={includeAgencies}
          onCheckedChange={(v) => set("jobfinder_include_agencies", v)}
        />
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="text-sm font-medium">Check every link is still live</span>
          <p className="text-xs text-muted-foreground">
            Off by default. On: every advert is opened before the candidate sees it and the
            expired ones are dropped, which does catch dead &ldquo;Apply&rdquo; buttons — a search
            engine&rsquo;s index runs weeks behind, and closed adverts are the pages it indexes
            best — but it shortens the list, and a site that blocks us counts against a job that
            is perfectly fine. Off: every advert found is shown, and some will have closed.
          </p>
        </div>
        <Switch
          checked={verifyLinks}
          onCheckedChange={(v) => set("jobfinder_verify_links", v)}
        />
      </div>
    </section>

    <section className="space-y-2 max-w-[12rem]">
      <label className="text-sm font-medium">Max advert age (days)</label>
      <Input
        type="number"
        min={1}
        max={365}
        value={cfg.jobfinder_max_age_days ?? D.jobfinder_max_age_days}
        onChange={(e) => set("jobfinder_max_age_days", Number(e.target.value))}
      />
      <p className="text-xs text-muted-foreground">
        The search is told not to return an advert posted longer ago than this.
      </p>
    </section>

    <section className="space-y-2">
      <label className="text-sm font-medium">Prompt</label>
      <Textarea
        value={cfg.job_finder_prompt ?? D.job_finder_prompt}
        onChange={(e) => set("job_finder_prompt", e.target.value)}
        rows={14}
        className="font-mono text-sm"
      />
      <p className="text-xs text-muted-foreground">
        Explain the task in plain words. The answer format below is sent with it.
      </p>
    </section>

    <PromptField
      label="Answer format"
      hint="The JSON the result cards are built from, and the one-entry-per-vacancy rule. Rename a field and the cards stop finding it."
      value={cfg.job_finder_output_contract}
      fallback={D.job_finder_output_contract}
      onChange={(v) => set("job_finder_output_contract", v)}
      rows={12}
    />
    <PromptField
      label="Message sent with each search"
      hint="Goes after the conversation, as the last thing the search reads."
      placeholders={["request", "today", "max_age_days", "agencies_rule", "output_contract"]}
      value={cfg.job_finder_run_instruction}
      fallback={D.job_finder_run_instruction}
      onChange={(v) => set("job_finder_run_instruction", v)}
      rows={6}
    />
    <PromptField
      label="Rule used when agencies are switched off"
      hint="Replaces {{agencies_rule}} above when the switch is off. Nothing is sent when it is on."
      value={cfg.job_finder_agencies_off_rule}
      fallback={D.job_finder_agencies_off_rule}
      onChange={(v) => set("job_finder_agencies_off_rule", v)}
      rows={3}
    />
  </div>
  );
};

export default JobFinderTab;
