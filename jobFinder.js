// Workflow 3 — "Job finder" pipeline.
// a candidate's request -> one web search pass over live adverts -> dedupe and
// cap in JS -> a list of jobs with title, location, salary and link.
//
// Unlike workflows 1 and 2 this looks for vacancies rather than people, and it
// is deliberately a single model call: the advert page itself is the evidence,
// so there is nothing a second pass could verify that the search did not
// already see. Everything after the search is cheap string work.

import { outputText, addUsage, parseJson } from "./agent.js";
import { JOB_FINDER_DEFAULTS as DEFAULTS } from "./agentPrompts.js";

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
  const maxAgeDays = Math.max(1, Number(c.jobfinder_max_age_days) || 30);
  const includeAgencies = c.jobfinder_include_agencies !== false;

  // The switch picks the prompt, and nothing else in the pipeline changes: the
  // difference between "agencies welcome" and "direct adverts only" is entirely
  // a matter of which sources the search is told to accept.
  const instructions = includeAgencies
    ? c.jobfinder_search_instructions_agencies
    : c.jobfinder_search_instructions_direct;

  // 2) One search pass.
  const criteriaBlock =
    `What the user is looking for: ${query}\n` +
    (location ? `Location: ${location}\n` : "Location: not specified — search broadly, and say where each job is.\n") +
    (keyFactors.length ? `Other things they asked for: ${keyFactors.join(", ")}\n` : "");

  const searchResp = await openai.responses.create({
    model,
    instructions,
    tools: [{ type: "web_search" }],
    input:
      `Find up to ${maxResults * 2} currently open data centre vacancies.\n` +
      criteriaBlock +
      `\nToday is ${new Date().toISOString().slice(0, 10)}. Do not return an advert posted more than ${maxAgeDays} days ago, or one you cannot date and cannot confirm is still open.\n` +
      (includeAgencies
        ? `Recruitment agency adverts are allowed on this pass. Flag each one with is_agency true.\n`
        : `Recruitment agency adverts are NOT allowed on this pass. Return only the employer's own advert, and set is_agency false on every job.\n`) +
      `\nReturn ONLY JSON: {"jobs":[{"title":string,"company":string,"location":string,"salary":string,"employment_type":string,"posted_date":string,"source":string,"url":string,"is_agency":boolean}],"note":string}`,
  });
  addUsage(usage, searchResp);
  const out = parseJson(outputText(searchResp), { jobs: [], note: "" });
  const rawJobs = Array.isArray(out.jobs) ? out.jobs : [];

  // 3) Dedupe on the normalised advert URL and cap. A job without a usable
  // advert link is not something the candidate can apply to, so it is dropped
  // rather than shown with no way in.
  const byUrl = new Map();
  for (const job of rawJobs) {
    const url = normalizeUrl(job?.url);
    if (!url || !isAdvertUrl(url)) continue;
    if (byUrl.has(url)) continue;
    const isAgency = Boolean(job?.is_agency);
    // The direct-only pass promises employer adverts; honour that here too, so
    // a model that ignores the prompt cannot leak agency listings through.
    if (!includeAgencies && isAgency) continue;
    byUrl.set(url, {
      title: str(job?.title),
      company: str(job?.company),
      location: str(job?.location),
      salary: str(job?.salary),
      employment_type: str(job?.employment_type),
      posted_date: str(job?.posted_date),
      source: str(job?.source),
      url,
      is_agency: isAgency,
    });
    if (byUrl.size >= maxResults) break;
  }
  const jobs = [...byUrl.values()];

  return {
    result: {
      criteria: { query, location, key_factors: keyFactors },
      include_agencies: includeAgencies,
      max_age_days: maxAgeDays,
      jobs,
      found_count: rawJobs.length,
      dropped_count: rawJobs.length - jobs.length,
      note: str(out.note),
      // Handed back as tool output rather than as system instructions, the same
      // way workflow 2 does it, so the chat model formats the list.
      presentation: c.jobfinder_compress_instructions,
    },
    usage,
  };
}
