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

// A search results page, a board's category listing or a company homepage is a
// place to look for a job, not a job. The search prompt says so; this is the
// backstop for when the model returns one anyway.
const NOT_AN_ADVERT =
  /\/(search|jobs|careers|vacancies|opportunities|results)\/?$|[?&](q|query|keywords|search)=/i;

function isAdvertUrl(url) {
  try {
    const u = new URL(url);
    if (u.pathname === "/" || u.pathname === "") return false;
    return !NOT_AN_ADVERT.test(u.pathname + u.search);
  } catch {
    return false;
  }
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
].join("\n");

export async function runJobFinder(openai, args = {}, cfg = {}, model = "gpt-4o", ctx = {}) {
  const usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0, requests: 0 };

  const request = str(args?.request);
  const prompt = str(cfg.job_finder_prompt) || DEFAULTS.job_finder_prompt;
  // The conversation so far, so a follow-up message lands in context rather
  // than starting from nothing.
  const history = Array.isArray(ctx.history) ? ctx.history : [];

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
          `Today is ${new Date().toISOString().slice(0, 10)}.\n` +
          OUTPUT_CONTRACT,
      },
    ],
  });
  addUsage(usage, resp);

  const out = parseJson(outputText(resp), { jobs: [], note: "" });
  const raw = Array.isArray(out?.jobs) ? out.jobs : [];

  // One row per advert URL. A search results page or a company homepage is a
  // place to look for a job, not a job, so it goes; whose site the advert is on
  // is read off the URL rather than taken on trust.
  const byUrl = new Map();
  for (const job of raw) {
    const url = normalizeUrl(job?.url);
    if (!url || !isAdvertUrl(url) || byUrl.has(url)) continue;
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

  // Follow every link. A 404, a "no longer accepting applications" banner on an
  // otherwise healthy 200, or a bounce to the board's search page all mean the
  // advert is gone. A 403 from a board that blocks datacentre IPs means only
  // that we were blocked, so those stay in, flagged.
  const { kept, dropped, stats } = await verifyLinks([...byUrl.values()], {
    phrases: JOB_EXPIRY_PHRASES,
    isDeadEndUrl: (u) => !isAdvertUrl(u),
  });

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
      direct_count: jobs.filter((j) => j.source_type === "direct").length,
      board_count: jobs.filter((j) => j.source_type !== "direct").length,
      found_count: raw.length,
      link_check: { ...stats, dropped: dropped.slice(0, 10) },
      note: str(out?.note),
    },
    usage,
  };
}
