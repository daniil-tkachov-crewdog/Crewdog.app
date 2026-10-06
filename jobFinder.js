// Workflow 3 — "Job finder" pipeline.
// a candidate's request -> two web searches in parallel (the employers' own
// adverts, and the boards and agencies) -> merge direct-first -> check every
// link -> a list of jobs with title, location, salary and link.
//
// Two searches rather than one because one prompt that merely allowed board
// listings returned nothing else: boards are trivially easy to find, so the
// model found them and stopped, and the candidate got a page of Indeed links.
// Splitting the passes gives the company career pages their own search budget,
// and the merge puts them on top — which is the order a candidate actually
// wants, since applying on the company's own site means no middleman.
//
// "Direct" here means the company's OWN DOMAIN. A vacancy on
// boards.greenhouse.io or <company>.myworkdayjobs.com is not a career page, it
// is recruitment software the employer rents, and it belongs with the boards.
// isEmployerSite() enforces that on the URL, whatever the search claims.
//
// Unlike workflows 1 and 2 there is no verification MODEL call: a second pass
// over the same search results has nothing new to read. What there is, since
// links started coming back dead, is a pass over the live pages — see
// linkCheck.js. A web search reads an index, and an index is a snapshot;
// expired adverts are the most thoroughly indexed pages a job board has. So
// every surviving URL is fetched before the candidate sees it, which costs no
// tokens and catches what the snapshot cannot.

import { outputText, addUsage, parseJson } from "./agent.js";
import { JOB_FINDER_DEFAULTS as DEFAULTS } from "./agentPrompts.js";
import { verifyLinks, parsePhrases, JOB_EXPIRY_PHRASES } from "./linkCheck.js";

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

export async function runJobFinder(openai, args = {}, cfg = {}, model = "gpt-4o") {
  const c = { ...DEFAULTS, ...cfg };
  const usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0, requests: 0 };

  // 1) Normalize the criteria coming off the tool call. Only the query is
  // required: "any data centre job, anywhere" is a real request, and asking a
  // candidate to name a city before showing them anything helps nobody.
  const a = args ?? {};
  const query = str(a.query);
  const location = str(a.location);
  const keyFactors = (Array.isArray(a.key_factors) ? a.key_factors : [])
    .map(str)
    .filter(Boolean)
    .slice(0, 8);

  if (!query) {
    return {
      result: {
        error: "missing_criteria",
        missing: ["query"],
        note: "Ask the user what kind of data centre role they are looking for, then call this tool again.",
      },
      usage,
    };
  }

  const maxResults = Math.max(1, Math.min(50, Number(c.jobfinder_max_results) || 8));
  const verifyEnabled = c.jobfinder_verify_links !== false;
  // Verification drops adverts, so the search has to bring back more than the
  // list needs. Two-for-one was enough when nothing was ever dropped; it is not
  // now, and a short list is the one outcome this change must not produce.
  const overFetch = Math.min(40, maxResults * (verifyEnabled ? 3 : 2));
  const maxAgeDays = Math.max(1, Number(c.jobfinder_max_age_days) || 30);
  const includeAgencies = c.jobfinder_include_agencies !== false;

  // 2) Two searches, in parallel. The direct pass always runs and has to be
  // able to fill the list on its own, so it gets the whole over-fetch budget.
  // The board pass is a backstop for the slots the direct pass cannot fill, and
  // only runs when the admin has asked for boards and agencies at all — but it
  // too can end up filling the whole list, so it needs more than the list
  // length to survive link checking.
  const criteriaBlock =
    `What the user is looking for: ${query}\n` +
    (location ? `Location: ${location}\n` : "Location: not specified — search broadly, and say where each job is.\n") +
    (keyFactors.length ? `Other things they asked for: ${keyFactors.join(", ")}\n` : "");

  const passes = [
    { source: "direct", instructions: c.jobfinder_search_instructions_direct, want: overFetch },
  ];
  if (includeAgencies) {
    passes.push({
      source: "board",
      instructions: c.jobfinder_search_instructions_boards,
      want: Math.min(20, Math.max(maxResults, maxResults * (verifyEnabled ? 2 : 1))),
    });
  }

  const passResults = await Promise.all(
    passes.map((pass) =>
      openai.responses
        .create({
          model,
          instructions: pass.instructions,
          tools: [{ type: "web_search" }],
          input:
            `Find up to ${pass.want} currently open data centre vacancies.\n` +
            criteriaBlock +
            `\nToday is ${new Date().toISOString().slice(0, 10)}. Do not return an advert posted more than ${maxAgeDays} days ago, or one you cannot date and cannot confirm is still open.\n` +
            (pass.source === "direct"
              ? `This pass accepts the hiring employer's own advert ONLY. Set is_agency false on every job.\n`
              : `This pass accepts job board and recruitment agency listings. Flag each agency-posted advert with is_agency true.\n`) +
            `\nReturn ONLY JSON: {"jobs":[{"title":string,"company":string,"location":string,"salary":string,"employment_type":string,"posted_date":string,"status_text":string,"source":string,"url":string,"is_agency":boolean}],"note":string}\n` +
            `status_text: the words the advert itself uses about its own status or date, quoted exactly as they appear ("Posted 4 days ago", "Applications close 12 October", "Actively hiring"). Leave it empty if the page states nothing of the kind — do not paraphrase and do not supply your own wording.`,
        })
        .then((resp) => {
          addUsage(usage, resp);
          const out = parseJson(outputText(resp), { jobs: [], note: "" });
          return {
            source: pass.source,
            want: pass.want,
            jobs: Array.isArray(out.jobs) ? out.jobs : [],
            note: str(out.note),
          };
        })
    )
  );
  const rawCount = passResults.reduce((n, p) => n + p.jobs.length, 0);

  // 3) Merge and dedupe on the normalised advert URL. The passes are walked
  // direct-first, so when both find the same role the employer's own URL is the
  // one kept — which is the whole point of running the direct pass. No cap on
  // the list here any more: the cap falls after verification, or a pass that
  // drops six of eight hands back two.
  const byUrl = new Map();
  for (const pass of passResults) {
    let taken = 0;
    for (const job of pass.jobs) {
      const url = normalizeUrl(job?.url);
      if (!url || !isAdvertUrl(url)) continue;
      if (byUrl.has(url)) continue;
      // The direct pass promises employer adverts; honour that here too, so a
      // model that ignores the prompt cannot file an agency post as direct.
      const isAgency = Boolean(job?.is_agency);
      if (pass.source === "direct" && isAgency) continue;
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
        is_agency: isAgency,
        // Which group it is shown under. The pass says where we looked, but the
        // URL says whose site it is, and the URL wins: the direct group means
        // the company's own career page, so an advert the direct pass found on
        // a board or on rented recruitment software is reclassified here rather
        // than taken on trust.
        source_type: pass.source === "direct" && isEmployerSite(url) ? "direct" : "board",
      });
      if (++taken >= pass.want) break;
    }
  }
  // With the board pass switched off, the only list the admin asked for is the
  // company career pages, so a reclassified link has nowhere to go.
  const candidates = [...byUrl.values()].filter(
    (j) => includeAgencies || j.source_type === "direct"
  );

  // 4) Follow every link. A 404, a "no longer accepting applications" banner on
  // an otherwise healthy 200, or a bounce to the board's search page all mean
  // the advert is gone. A 403 from a board that blocks datacentre IPs means
  // only that we were blocked, so those stay in, flagged.
  let survivors = candidates;
  let checkStats = null;
  let droppedDead = [];
  if (verifyEnabled) {
    const { kept, dropped, stats } = await verifyLinks(candidates, {
      phrases: parsePhrases(c.jobfinder_expiry_phrases, JOB_EXPIRY_PHRASES),
      isDeadEndUrl: (u) => !isAdvertUrl(u),
    });
    survivors = kept;
    checkStats = stats;
    droppedDead = dropped;
  }

  // 5) Assemble the list direct-first: every employer advert that survived,
  // then board and agency listings for whatever slots are left. Each group
  // keeps the order its own search returned it in, which is relevance order.
  // So a search that finds eight direct adverts shows eight direct adverts and
  // no board links at all — the boards only ever fill a gap.
  const direct = survivors.filter((j) => j.source_type === "direct");
  const boards = survivors.filter((j) => j.source_type !== "direct");
  const jobs = [
    ...direct.slice(0, maxResults),
    ...boards.slice(0, Math.max(0, maxResults - Math.min(direct.length, maxResults))),
  ];

  return {
    result: {
      criteria: { query, location, key_factors: keyFactors },
      include_agencies: includeAgencies,
      max_age_days: maxAgeDays,
      jobs,
      direct_count: jobs.filter((j) => j.source_type === "direct").length,
      board_count: jobs.filter((j) => j.source_type !== "direct").length,
      found_count: rawCount,
      dropped_count: rawCount - jobs.length,
      link_check: checkStats
        ? { ...checkStats, dropped: droppedDead.slice(0, 10) }
        : { skipped: true },
      // Either pass may have something to say about what it could not find.
      note: passResults
        .map((p) => p.note)
        .filter(Boolean)
        .join(" "),
      // Handed back as tool output rather than as system instructions, the same
      // way workflow 2 does it, so the chat model formats the list.
      presentation: c.jobfinder_compress_instructions,
    },
    usage,
  };
}
