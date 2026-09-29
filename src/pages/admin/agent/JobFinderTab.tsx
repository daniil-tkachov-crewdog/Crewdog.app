import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { AgentConfig } from "@/services/settings";
import { JOB_FINDER_DEFAULTS as D } from "../../../../agentPrompts.js";

type Props = {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  cfg: AgentConfig;
  set: (k: keyof AgentConfig, v: string | number | boolean | string[]) => void;
};

// Workflow 3: the other two find people, this one finds vacancies. A candidate
// asks for a data centre job, one web search pass collects live adverts, and
// the chatbot prints title / location / salary / link for each.
const JobFinderTab = ({ enabled, setEnabled, cfg, set }: Props) => {
  const includeAgencies = cfg.jobfinder_include_agencies ?? D.jobfinder_include_agencies;
  const verifyLinks = cfg.jobfinder_verify_links ?? D.jobfinder_verify_links;
  // Only one of the two search prompts runs, but both stay editable — the one
  // that is off today still needs tuning for tomorrow.
  const liveNote = (isLive: boolean) =>
    isLive ? (
      <span className="text-xs font-normal text-emerald-600 dark:text-emerald-500">
        · live
      </span>
    ) : (
      <span className="text-xs font-normal text-muted-foreground">· inactive</span>
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between max-w-xs">
        <span className="text-sm font-medium">Workflow enabled</span>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>
      <p className="text-xs text-muted-foreground">
        When on, asking the chatbot to find you a job triggers the pipeline: what the user is
        looking for (+ location and any extras they mention) → one web search over live data
        centre adverts → duplicates and dead links dropped → a list showing each job's title,
        location, salary and a link to the advert. The scope is the data centre industry in any
        form; the chatbot turns down off-sector requests rather than running a search. Location
        is optional — a user who has not named a city still gets results.
      </p>

      <section className="space-y-2">
        <div className="flex items-center justify-between max-w-xs">
          <span className="text-sm font-medium">Show recruitment agencies?</span>
          <Switch
            checked={includeAgencies}
            onCheckedChange={(v) => set("jobfinder_include_agencies", v)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {includeAgencies
            ? "On — the search runs the “agencies included” prompt below: employer adverts, job boards and recruitment agency listings, with agency posts flagged in the reply."
            : "Off — the search runs the “direct adverts only” prompt below: the hiring company's own career page or ATS posting, with agency listings and agency reposts rejected."}
        </p>
      </section>

      <div className="flex gap-4">
        <section className="space-y-2 max-w-[10rem]">
          <label className="text-sm font-medium">Max jobs</label>
          <Input
            type="number"
            min={1}
            max={50}
            value={cfg.jobfinder_max_results ?? D.jobfinder_max_results}
            onChange={(e) => set("jobfinder_max_results", Number(e.target.value))}
          />
        </section>

        <section className="space-y-2 max-w-[10rem]">
          <label className="text-sm font-medium">Max advert age (days)</label>
          <Input
            type="number"
            min={1}
            max={365}
            value={cfg.jobfinder_max_age_days ?? D.jobfinder_max_age_days}
            onChange={(e) => set("jobfinder_max_age_days", Number(e.target.value))}
          />
        </section>
      </div>
      <p className="text-xs text-muted-foreground -mt-4">
        Max jobs caps the list the user sees; the search looks wider than that so duplicates and
        dead links can be dropped without shortening the list. An advert posted longer ago than
        the max age is skipped, as is one that cannot be dated and confirmed still open.
      </p>

<section className="space-y-2">
        <div className="flex items-center justify-between max-w-xs">
          <span className="text-sm font-medium">Verify links before showing?</span>
          <Switch
            checked={verifyLinks}
            onCheckedChange={(v) => set("jobfinder_verify_links", v)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {verifyLinks
            ? "On \u2014 every advert link is opened and read before the user sees it. A 404, a page whose text matches one of the phrases below, or a redirect to the site's own search page all mean the advert is gone, and it is dropped. A site that blocks us (403, rate limit, timeout) proves nothing either way, so those stay in the list and the reply says it could not confirm them. Costs no tokens and adds a few seconds."
            : "Off \u2014 adverts are shown exactly as the search reported them. The search reads an index, and an index runs weeks behind: expect expired adverts and dead links."}
        </p>
      </section>

      <section className="space-y-2">
        <label className="text-sm font-medium">Expired-listing phrases</label>
        <Textarea
          value={cfg.jobfinder_expiry_phrases ?? D.jobfinder_expiry_phrases}
          onChange={(e) => set("jobfinder_expiry_phrases", e.target.value)}
          rows={10}
          className="font-mono text-sm"
          disabled={!verifyLinks}
        />
        <p className="text-xs text-muted-foreground">
          One phrase per line, matched case-insensitively against the page's visible text. A dead advert
          usually answers 200 rather than 404 \u2014 it keeps the URL and swaps the body for a notice \u2014
          so this list is what actually catches it. Keep each phrase a sentence the page states about
          itself: a bare status word can match a live page that happens to mention a
          filled role elsewhere, and would drop a good listing.
        </p>
      </section>

      <section className="space-y-2">
        <label className="text-sm font-medium">
          Search prompt — agencies included {liveNote(includeAgencies)}
        </label>
        <Textarea
          value={
            cfg.jobfinder_search_instructions_agencies ?? D.jobfinder_search_instructions_agencies
          }
          onChange={(e) => set("jobfinder_search_instructions_agencies", e.target.value)}
          rows={18}
          className="font-mono text-sm"
        />
      </section>

      <section className="space-y-2">
        <label className="text-sm font-medium">
          Search prompt — direct adverts only {liveNote(!includeAgencies)}
        </label>
        <Textarea
          value={
            cfg.jobfinder_search_instructions_direct ?? D.jobfinder_search_instructions_direct
          }
          onChange={(e) => set("jobfinder_search_instructions_direct", e.target.value)}
          rows={18}
          className="font-mono text-sm"
        />
      </section>

      <section className="space-y-2">
        <label className="text-sm font-medium">Presentation prompt</label>
        <Textarea
          value={cfg.jobfinder_compress_instructions ?? D.jobfinder_compress_instructions}
          onChange={(e) => set("jobfinder_compress_instructions", e.target.value)}
          rows={12}
          className="font-mono text-sm"
        />
      </section>
    </div>
  );
};

export default JobFinderTab;
