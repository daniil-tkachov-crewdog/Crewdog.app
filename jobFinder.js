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

import { outputText, addUsage, parseJson } from "./agent.js";
import { JOB_FINDER_DEFAULTS as DEFAULTS } from "./agentPrompts.js";
import { verifyLinks, JOB_EXPIRY_PHRASES } from "./linkCheck.js";

const str = (v) => String(v ?? "").trim();

// Strip tracking params and trailing slashes so the same advert found twice
// under two campaign URLs collapses to one job. Unlike the LinkedIn finder this
// accepts any host — an advert legitimately lives on a career page, an ATS
// domain or a board — so the only shape rule is "an http(s) URL with a host".
const TRACKING_PARAM = /^(utm_|gh_|ref$|source$|src$|trk$|trackid$|campaign)/i;

function normalizeUrl(url) {
  const raw = str(url);
  if (!/^https?:\/\//i.test(raw)) return "";
  try {
    const u = new URL(raw);
    if (!u.hostname.includes(".")) return "";
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAM.test(key)) u.searchParams.delete(key);
    }
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return u.toString();
  } catch {
    return "";
  }
}

// Hosts that are never the hiring company's own website. Two kinds, and the
// second is the one worth being explicit about: a vacancy on
// equinix.wd1.myworkdayjobs.com or boards.greenhouse.io/<company> is the
// employer's own advert in the sense that the application lands on their desk,
// but it is NOT their career page — it is recruitment software they rent, on
// somebody else's domain, and the candidate can see that in the URL. The direct
// group means the company's own site, so everything here is excluded from it.
//
// A blocklist, not an allowlist, because the employer's domain is whatever the
// employer owns and cannot be enumerated. An unknown platform therefore slips
// through as "direct" until it is named here; the search prompt is the first
// line of defence and this is the backstop.
const NOT_EMPLOYER_HOSTS = [
  // Applicant tracking systems and hosted careers sites.
  "greenhouse.io", "lever.co", "myworkdayjobs.com", "myworkdaysite.com", "workday.com",
  "smartrecruiters.com", "teamtailor.com", "workable.com", "ashbyhq.com", "icims.com",
  "jobvite.com", "bamboohr.com", "recruitee.com", "personio.de", "personio.com",
  "breezy.hr", "pinpointhq.com", "jazzhr.com", "applytojob.com", "avature.net",
  "phenompeople.com", "eightfold.ai", "csod.com", "cornerstoneondemand.com",
  "brassring.com", "silkroad.com", "hirebridge.com", "catsone.com", "clearcompany.com",
  "dayforcehcm.com", "ultipro.com", "paylocity.com", "paycomonline.net", "adp.com",
  "rippling.com", "gohire.io", "occupop.com", "peoplehr.net", "tribepad.com",
  "networxrecruitment.com", "jobtrain.co.uk", "eploy.co.uk", "vacancy-filler.co.uk",
  "webrecruit.co.uk", "hireful.co.uk", "tal.net", "isolvedhire.com", "polymer.co",
  "jobs.jobvite.com", "recruiterbox.com", "hrmdirect.com", "snaphunt.com",
  // Boards, aggregators and professional networks.
  "linkedin.com", "totaljobs.com", "reed.co.uk", "cv-library.co.uk", "jobserve.com",
  "jobsite.co.uk", "cwjobs.co.uk", "technojobs.co.uk", "irishjobs.ie", "jobs.ie",
  "simplyhired.com", "careerbuilder.com", "dice.com", "xing.com", "infojobs.net",
  "welcometothejungle.com", "otta.com", "wellfound.com", "angel.co", "builtin.com",
  "efinancialcareers.com", "jobtome.com", "jobrapido.com", "bebee.com", "recruit.net",
  "learn4good.com", "hiring.cafe", "workinstartups.com", "jobbank.gc.ca", "jobs.ac.uk",
  "datacenterdynamics.com", "glassdoor.com", "indeed.com",
];

// The ones with a domain per country (indeed.co.uk, glassdoor.ie, seek.com.au…),
// plus the platforms whose host varies but whose brand does not.
const NOT_EMPLOYER_PATTERNS = [
  /(^|\.)indeed\./, /(^|\.)glassdoor\./, /(^|\.)monster\./, /(^|\.)ziprecruiter\./,
  /(^|\.)adzuna\./, /(^|\.)jooble\./, /(^|\.)careerjet\./, /(^|\.)trovit\./,
  /(^|\.)stepstone\./, /(^|\.)seek\.com/, /(^|\.)talent\.com/, /(^|\.)neuvoo\./,
  /(^|\.)whatjobs\./, /(^|\.)jobstreet\./, /(^|\.)naukri\./, /(^|\.)oraclecloud\.com$/,
  /(^|\.)successfactors\./, /(^|\.)sapsf\./, /(^|\.)taleo\./, /(^|\.)icims\./,
  /(^|\.)greenhouse\./, /(^|\.)lever\.co$/, /(^|\.)myworkday/, /(^|\.)smartrecruiters\./,
  /(^|\.)teamtailor\./, /(^|\.)workable\./, /(^|\.)ashbyhq\./, /(^|\.)jobs\.google\./,
];

// True when the URL is on a domain the hiring company itself owns — which is
// everything left once the platforms and the boards are taken out.
function isEmployerSite(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  if (NOT_EMPLOYER_HOSTS.some((d) => host === d || host.endsWith(`.${d}`))) return false;
  return !NOT_EMPLOYER_PATTERNS.some((re) => re.test(host));
}


// Not admin-editable: the shape is wired to the result cards, so it travels
// with the code rather than with the prompt.
const OUTPUT_CONTRACT = [
  "Return ONLY JSON, in this shape:",
  '{"jobs":[{"title":string,"company":string,"location":string,"salary":string,"employment_type":string,"posted_date":string,"status_text":string,"source":string,"url":string,"is_agency":boolean}],"note":string}',
  "- url: the advert's own URL, exactly as the search result showed it.",
  "- salary: the advert's own wording, with its currency and period, or empty when it states none.",
  "- status_text: the words the advert uses about its own status or date, quoted (\"Posted 4 days ago\", \"Applications close 12 October\"). Empty when it says nothing of the kind — do not supply your own wording.",
  "- is_agency: true when a recruitment, staffing or search agency posted it rather than the employer.",
  "- note: one short line about anything the search could not do, or empty.",
  "",
  "ONE ENTRY PER VACANCY. The same job turns up in several of your searches, on several sites, under slightly different URLs and sometimes under a slightly different title — that is one vacancy and it gets one entry. Before you answer, read your own list back and collapse anything that is the same role at the same employer in the same place, keeping the best link for it (the employer's own site over a board, the board over an aggregator). A list of eight distinct jobs is worth more than sixteen entries covering eight.",
].join("\n");

export async function runJobFinder(openai, args = {}, cfg = {}, model = "gpt-4o", ctx = {}) {
  const usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0, requests: 0 };

  const c = { ...DEFAULTS, ...cfg };
  const request = str(args?.request);
  const prompt = str(cfg.job_finder_prompt) || DEFAULTS.job_finder_prompt;
  // The conversation so far, so a follow-up message lands in context rather
  // than starting from nothing.
  const history = Array.isArray(ctx.history) ? ctx.history : [];

  // The three admin switches. They are behaviour, not prompt text: how old an
  // advert may be, whether boards and agencies count at all, and whether every
  // surviving link is opened before the candidate sees it.
  const maxAgeDays = Math.max(1, Number(c.jobfinder_max_age_days) || 30);
  const includeAgencies = c.jobfinder_include_agencies !== false;
  const verifyEnabled = c.jobfinder_verify_links !== false;

  const resp = await openai.responses.create({
    model,
    instructions: `${prompt}\n\n${OUTPUT_CONTRACT}`,
    tools: [{ type: "web_search" }],
    input: [
      ...history,
      {
        role: "user",
        content:
          `Run the search now for: ${request || "what I asked for above"}\n\n` +
          `Today is ${new Date().toISOString().slice(0, 10)}. Do not return an advert posted more than ${maxAgeDays} days ago, or one you cannot date and cannot confirm is still open.\n` +
          (includeAgencies
            ? ""
            : "Only adverts on the hiring company's own website. Job boards, recruitment platforms and agency listings are not wanted in this search.\n") +
          OUTPUT_CONTRACT,
      },
    ],
  });
  addUsage(usage, resp);

  const out = parseJson(outputText(resp), { jobs: [], note: "" });
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
