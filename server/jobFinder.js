// Workflow 3 — "Job finder".
//
// One prompt, one call, like workflow 2: the chat model passes on what the
// candidate asked for, the whole conversation goes with it, and the admin's
// single prompt (see agentPrompts.js) is injected as the instructions every
// time. Everything about HOW to search lives in that prompt.
//
// What the code adds is the JSON shape the cards need, a dedupe on the advert
// URL, the direct/board split, and a pass over the live pages (linkCheck.js).
// That last one is not a model call: a web search reads an index, an index is a
// snapshot, and expired adverts are the most thoroughly indexed pages a job
// board has — so every URL is fetched before the candidate sees it, which costs
// no tokens and catches what the snapshot cannot.
//
// "Direct" means the company's OWN DOMAIN. A vacancy on boards.greenhouse.io or
// <company>.myworkdayjobs.com is not a career page, it is recruitment software
// the employer rents, and it belongs with the boards. isEmployerSite() decides
// that from the URL, whatever the search claims.

import { runModelStage } from "./workflows/runModelStage.js";
import { renderTemplate as render } from "./functions/text/renderTemplate.js";
import { today } from "./functions/date/today.js";
import { JOB_FINDER_DEFAULTS as DEFAULTS } from "./agentPrompts.js";
import { verifyLinks, JOB_EXPIRY_PHRASES } from "./linkCheck.js";

import { str } from "./functions/text/str.js";
import { normalizeListingUrl } from "./functions/url/normalizeListingUrl.js";
import { isEmployerSite } from "./functions/url/isEmployerSite.js";

// Strip tracking params and trailing slashes so the same advert found twice
// under two campaign URLs collapses to one job. Unlike the LinkedIn finder this
// accepts any host — an advert legitimately lives on a career page, an ATS
// domain or a board — so the only shape rule is "an http(s) URL with a host".
const TRACKING_PARAM = /^(utm_|gh_|ref$|source$|src$|trk$|trackid$|campaign)/i;

// Bound to the job finder's own tracking-parameter list: gh_ is
// Greenhouse's and is meaningless anywhere else, which is why this list
// and the accommodation finder's are not merged.
const normalizeUrl = (url) => normalizeListingUrl(url, TRACKING_PARAM);



export async function runJobFinder(openai, args = {}, cfg = {}, model = "gpt-4o", ctx = {}) {
  const usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0, requests: 0 };

  const c = { ...DEFAULTS, ...cfg };
  const request = str(args?.request);
  // Every one of these is an editable field in the admin panel.
  const prompt = str(c.job_finder_prompt) || DEFAULTS.job_finder_prompt;
  const outputContract =
    str(c.job_finder_output_contract) || DEFAULTS.job_finder_output_contract;
  const runInstruction =
    str(c.job_finder_run_instruction) || DEFAULTS.job_finder_run_instruction;
  const agenciesOffRule = str(c.job_finder_agencies_off_rule);
  // The conversation so far, so a follow-up message lands in context rather
  // than starting from nothing.
  const history = Array.isArray(ctx.history) ? ctx.history : [];

  // The three admin switches. They are behaviour, not prompt text: how old an
  // advert may be, whether boards and agencies count at all, and whether every
  // surviving link is opened before the candidate sees it.
  const maxAgeDays = Math.max(1, Number(c.jobfinder_max_age_days) || 30);
  const includeAgencies = c.jobfinder_include_agencies !== false;
  const verifyEnabled = c.jobfinder_verify_links !== false;

  const { data: out } = await runModelStage({
    openai,
    model,
    instructions: `${prompt}\n\n${outputContract}`,
    tools: [{ type: "web_search" }],
    input: [
      ...history,
      {
        role: "user",
        content: render(runInstruction, {
          request: request || "what I asked for above",
          today: today(),
          max_age_days: maxAgeDays,
          agencies_rule: includeAgencies ? "" : agenciesOffRule,
          output_contract: outputContract,
        }),
      },
    ],
    usage,
    fallback: { jobs: [], note: "" },
  });
  const raw = Array.isArray(out?.jobs) ? out.jobs : [];

  // One row per advert URL. Nothing else is thrown away here: a URL shape is a
  // guess, and guessing cost more real adverts than it ever saved — the ones
  // copied off a board's results page carry its "?keywords=" with them and were
  // being binned as search pages. Whose site the advert is on is still read off
  // the URL rather than taken on trust, because that only sorts the list.
  //
  // Every rejection is counted. "16 found, 6 shown" with no account of the ten
  // is how three separate filters each got blamed for the others' losses, so
  // the numbers now travel with the result and into the call log.
  const dropped = { no_url: 0, duplicate: 0, no_title: 0, agency_filtered: 0 };
  const byUrl = new Map();
  for (const job of raw) {
    const url = normalizeUrl(job?.url);
    if (!url) {
      dropped.no_url += 1;
      continue;
    }
    if (byUrl.has(url)) {
      dropped.duplicate += 1;
      continue;
    }
    // The cards need a name to show; a row without one collapses the group.
    if (!str(job?.title)) {
      dropped.no_title += 1;
      continue;
    }
    byUrl.set(url, {
      title: str(job?.title),
      company: str(job?.company),
      location: str(job?.location),
      salary: str(job?.salary),
      employment_type: str(job?.employment_type),
      posted_date: str(job?.posted_date),
      status_text: str(job?.status_text),
      source: str(job?.source),
      url,
      is_agency: Boolean(job?.is_agency),
      source_type: isEmployerSite(url) ? "direct" : "board",
    });
  }

  // With boards and agencies switched off, the only list the admin asked for is
  // the company career pages — and the URL decides that, not the search, so an
  // advert the model called direct but hosted on rented recruitment software
  // still goes.
  const candidates = [...byUrl.values()].filter((j) => {
    if (includeAgencies || j.source_type === "direct") return true;
    dropped.agency_filtered += 1;
    return false;
  });

  // Off by default now. It does catch dead adverts — a search index is weeks
  // behind and closed adverts are the pages it indexes best — but it was
  // costing more of the list than it was worth, so it is opt-in from the tab.
  let kept = candidates;
  let checkStats = null;
  let droppedDead = [];
  if (verifyEnabled) {
    const checked = await verifyLinks(candidates, { phrases: JOB_EXPIRY_PHRASES });
    kept = checked.kept;
    checkStats = checked.stats;
    droppedDead = checked.dropped;
  }

  // Employer career pages first — applying on the company's own site means no
  // middleman — then everything else, each group in the order the search gave.
  const jobs = [
    ...kept.filter((j) => j.source_type === "direct"),
    ...kept.filter((j) => j.source_type !== "direct"),
  ];

  return {
    result: {
      request,
      jobs,
      include_agencies: includeAgencies,
      max_age_days: maxAgeDays,
      direct_count: jobs.filter((j) => j.source_type === "direct").length,
      board_count: jobs.filter((j) => j.source_type !== "direct").length,
      found_count: raw.length,
      dropped,
      link_check: checkStats
        ? { ...checkStats, dropped: droppedDead.slice(0, 10) }
        : { skipped: true },
      note: str(out?.note),
    },
    usage,
  };
}
