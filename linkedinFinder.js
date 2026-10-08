// Workflow 2 — "LinkedIn finder" pipeline.
// title + location (+ any extra key factors) -> LinkedIn-domain web search ->
// enrich/dedupe -> verify each profile against the key factors -> compressed list.
//
// Unlike workflow 1 (agent.js) this never needs a job description: a recruiter
// just asks for people. LinkedIn authwalls anonymous profile GETs, so the
// evidence the verifier works from is the search result itself; `enrich()` is
// the seam where a real scraper or profile API would slot in later.

import { outputText, addUsage, parseJson } from "./agent.js";
import { LINKEDIN_FINDER_DEFAULTS as DEFAULTS, FINDER_ROUTES } from "./agentPrompts.js";

// linkedin.com/in/<slug> — anything else (company pages, job posts, search
// result pages, other domains) is not a person and gets dropped.
const PROFILE_RE = /^https?:\/\/([a-z0-9-]+\.)*linkedin\.com\/in\/[^/?#\s]+/i;

// Strip tracking params, trailing slashes and the locale subdomain so the same
// person found twice under different URLs collapses to one candidate. Exported
// because the contact-lookup cache keys on it too: the same person has to be
// one cache row for the same reason they are one candidate here.
export function normalizeUrl(url) {
  const raw = String(url ?? "").trim();
  if (!PROFILE_RE.test(raw)) return "";
  try {
    const u = new URL(raw);
    const slug = u.pathname.replace(/\/+$/, "").split("/in/")[1] ?? "";
    if (!slug) return "";
    return `https://www.linkedin.com/in/${decodeURIComponent(slug).toLowerCase()}`;
  } catch {
    return "";
  }
}

// A readable name from the profile slug, for the profiles whose name the search
// could not read. Without this such a person is dropped on the floor: the card
// list requires a name, so a nameless row collapses the whole group and the
// reply falls back to printing bare "Profile" links.
//
// linkedin.com/in/jan-de-vries-8b41720a -> "Jan De Vries". The trailing hash
// LinkedIn appends to disambiguate is dropped; a slug that is all hash, or a
// single run of letters, yields nothing rather than a nonsense name.
export function nameFromProfileUrl(url) {
  const slug = String(url ?? "")
    .split("/in/")[1]
    ?.split(/[/?#]/)[0];
  if (!slug) return "";
  const words = decodeURIComponent(slug)
    .split("-")
    // The disambiguating suffix is hex, so a word with a digit in it is never
    // part of the name.
    .filter((w) => w && !/\d/.test(w));
  if (words.length < 2) return "";
  return words
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

// Build the X-ray query the search step is told to run.
function buildQuery(jobTitle, location, keyFactors) {
  const parts = [`site:linkedin.com/in/`, `"${jobTitle}"`, `"${location}"`];
  for (const f of keyFactors) parts.push(`"${f}"`);
  return parts.join(" ");
}

const str = (v) => String(v ?? "").trim();

// "Available to work" is a different kind of criterion from "NDT" or "London":
// it is a bonus the evidence may or may not show, never a reason to hide
// someone who matches the actual job. Asked for, it sorts and labels the list;
// it never filters it.
const AVAILABILITY_FACTOR =
  /\b(availab\w*|open to work|opentowork|looking for|seeking|free to start|between roles|immediately|on the market|actively looking)\b/i;

const isAvailabilityFactor = (f) => AVAILABILITY_FACTOR.test(f);

// Interleave the routes' hits before capping, so a cheap route that returns
// plenty cannot crowd out the one that found the person actually saying they
// are free.
function interleave(perRoute) {
  const out = [];
  for (let i = 0; perRoute.some((list) => i < list.length); i++) {
    for (const list of perRoute) if (i < list.length) out.push(list[i]);
  }
  return out;
}

// Merge the routes' hits into one record per person, keyed on the normalised
// profile URL. The same person found twice is not a duplicate to discard: the
// second sighting is more evidence, so the sources, signals and snippets
// accumulate rather than overwrite.
function enrich(perRoute, limit) {
  const byUrl = new Map();
  for (const cand of interleave(perRoute)) {
    const url = normalizeUrl(cand?.linkedin_url);
    if (!url) continue;

    const existing = byUrl.get(url);
    if (!existing) {
      if (byUrl.size >= limit) continue;
      byUrl.set(url, {
        name: str(cand?.name) || nameFromProfileUrl(url),
        headline: str(cand?.headline),
        title: str(cand?.title),
        company: str(cand?.company),
        location: str(cand?.location),
        linkedin_url: url,
        evidence: [str(cand?.snippet) || str(cand?.headline)].filter(Boolean),
        evidence_sources: [str(cand?.evidence_source)].filter(Boolean),
        discovery_routes: [str(cand?.discovery_route)].filter(Boolean),
        availability_signal: str(cand?.availability_signal),
        signal_date: str(cand?.signal_date),
        mobility_evidence: str(cand?.mobility_evidence),
      });
      continue;
    }

    // Fill the blanks the first sighting left, and keep every distinct signal.
    for (const k of ["name", "headline", "title", "company", "location", "mobility_evidence"]) {
      if (!existing[k]) existing[k] = str(cand?.[k === "mobility_evidence" ? "mobility_evidence" : k]);
    }
    // A name the search actually read beats one derived from the slug.
    if (str(cand?.name)) existing.name = str(cand.name);
    for (const [k, v] of [
      ["evidence", str(cand?.snippet) || str(cand?.headline)],
      ["evidence_sources", str(cand?.evidence_source)],
      ["discovery_routes", str(cand?.discovery_route)],
    ]) {
      if (v && !existing[k].includes(v)) existing[k].push(v);
    }
    // A dated signal beats an undated one; otherwise the first stands.
    if (str(cand?.availability_signal) && (!existing.availability_signal || (!existing.signal_date && str(cand?.signal_date)))) {
      existing.availability_signal = str(cand?.availability_signal);
      existing.signal_date = str(cand?.signal_date);
    }
  }
  return [...byUrl.values()];
}

export async function runLinkedinFinder(openai, args = {}, cfg = {}, model = "gpt-4o") {
  const c = { ...DEFAULTS, ...cfg };
  const usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0, requests: 0 };

  // 1) Normalize the criteria coming off the tool call.
  const a = args ?? {};
  const jobTitle = String(a.job_title ?? "").trim();
  const location = String(a.location ?? "").trim();
  const keyFactors = (Array.isArray(a.key_factors) ? a.key_factors : [])
    .map((f) => String(f ?? "").trim())
    .filter(Boolean)
    .slice(0, 8);
  // Availability is pulled out of the criteria the verifier gates on. Whether
  // the recruiter asked for it or not, the list carries both kinds of person —
  // asking for it only decides how loudly the available ones are announced.
  const coreFactors = keyFactors.filter((f) => !isAvailabilityFactor(f));
  const askedForAvailable = keyFactors.some(isAvailabilityFactor);

  // Title and location are the two the workflow cannot run without; the model is
  // told to ask the user for them, so reaching here means it guessed wrong.
  if (!jobTitle || !location) {
    return {
      result: {
        error: "missing_criteria",
        missing: [!jobTitle && "job_title", !location && "location"].filter(Boolean),
        note: "Ask the user for the missing job title and/or location, then call this tool again.",
      },
      usage,
    };
  }

  // One limiter for the whole pipeline: how many links get searched for,
  // carried through verification, and shown to the user.
  const maxResults = Math.max(1, Math.min(50, Number(c.finder_max_results) || 8));
  const minConfidence = Math.max(0, Math.min(1, Number(c.finder_min_confidence) ?? 0.5));
  // How recent an availability signal has to be before anyone is called free.
  const signalMaxAgeDays = Math.max(1, Number(c.finder_signal_max_age_days) || 90);
  // How many people each route is asked to bring back. It is a search budget,
  // not a cap on the answer: nobody the search finds is thrown away, because a
  // recruiter would rather see a weak match than be told there is only one
  // person in London.
  const searchPool = maxResults;
  const query = buildQuery(jobTitle, location, coreFactors);
  const criteria = {
    job_title: jobTitle,
    location,
    key_factors: coreFactors,
    availability: askedForAvailable ? "requested" : "surfaced when found",
  };

  // 2) One search pass per enabled discovery route. The same person reached
  // from two directions is two pieces of evidence, and the strongest one — a
  // post saying they are free — is rarely on the profile itself. Run them
  // together so the extra routes cost tokens, not wall-clock time.
  const enabledKeys = Array.isArray(c.finder_routes) && c.finder_routes.length
    ? c.finder_routes
    : DEFAULTS.finder_routes;
  const routes = FINDER_ROUTES.filter((r) => enabledKeys.includes(r.key));
  const activeRoutes = routes.length ? routes : FINDER_ROUTES.filter((r) => r.default);

  const criteriaBlock =
    `Job title: ${jobTitle}\n` +
    `Location: ${location}\n` +
    (keyFactors.length ? `Other key factors: ${keyFactors.join(", ")}\n` : "") +
    `Common extra factors to watch for: ${c.finder_extra_factor_hints}\n`;

  const searchResps = await Promise.all(
    activeRoutes.map((route) =>
      openai.responses.create({
        model,
        instructions: c.finder_search_instructions,
        tools: [{ type: "web_search" }],
        input:
          `Discovery route for this pass — ${route.label}:\n${route.focus}\n\n` +
          `Find up to ${searchPool} people matching these criteria.\n` +
          criteriaBlock +
          `\nStarting query (vary it as your instructions say):\n${query}\n\n` +
          `Set discovery_route to "${route.key}" on every person you return.\n` +
          `Return ONLY JSON: {"candidates":[{"name":string,"headline":string,"title":string,"company":string,"location":string,"linkedin_url":string,"snippet":string,"availability_signal":string,"signal_date":string,"mobility_evidence":string,"evidence_source":string,"discovery_route":string}]}`,
      }).then((resp) => {
        addUsage(usage, resp);
        const out = parseJson(outputText(resp), { candidates: [] });
        const list = Array.isArray(out.candidates) ? out.candidates : [];
        // Trust the route we asked for over the one the model echoed back.
        return list.map((cand) => ({ ...cand, discovery_route: route.key }));
      })
    )
  );
  const rawCandidates = searchResps.flat();

  // 3) Merge the routes into one record per person.
  // A safety ceiling, not a display limit — it only stops a runaway search.
  const candidates = enrich(searchResps, Math.max(searchPool * 4, 100));
  if (!candidates.length) {
    return {
      result: {
        query,
        criteria,
        available: [],
        others: [],
        unconfirmed: [],
        checked_count: 0,
        presentation: c.finder_compress_instructions,
      },
      usage,
    };
  }

  // 4) Verify each candidate. Title, location and the non-availability factors
  // decide whether someone belongs on the list at all; availability is judged
  // alongside, as a label rather than a gate.
  const verifyResp = await openai.responses.create({
    model,
    instructions: c.finder_verify_instructions,
    input:
      `Criteria:\n` +
      `- job title: ${jobTitle}\n` +
      `- location: ${location}\n` +
      coreFactors.map((f) => `- ${f}`).join("\n") +
      `\n\nAn availability signal counts as current only if dated within the last ${signalMaxAgeDays} days. Today is ${new Date().toISOString().slice(0, 10)}.\n` +
      `\nCandidates (evidence is what the search actually showed; evidence_sources says where each piece came from):\n` +
      JSON.stringify(candidates, null, 1) +
      `\n\nFor every candidate, return ONLY JSON: {"results":[{"linkedin_url":string,"verified":boolean,"matched_factors":string[],"missing_factors":string[],"unverified":string[],"availability_current":boolean,"confidence":number,"reason":string}]}`,
  });
  addUsage(usage, verifyResp);
  const verifyOut = parseJson(outputText(verifyResp), { results: [] });
  const verdicts = new Map(
    (Array.isArray(verifyOut.results) ? verifyOut.results : []).map((r) => [
      normalizeUrl(r?.linkedin_url),
      r,
    ])
  );

  // 5) Rank into three tiers. Everyone the search found is returned — a person
  // the evidence could not confirm is still a lead, and discarding them is how
  // a search over ten people came back showing one. Verification decides where
  // someone sits, never whether they appear.
  const matched = [];
  const unconfirmed = [];
  for (const cand of candidates) {
    const v = verdicts.get(cand.linkedin_url);
    const confidence = Number(v?.confidence ?? 0);
    const shaped = {
      name: cand.name,
      title: cand.title || cand.headline,
      company: cand.company,
      location: cand.location,
      linkedin_url: cand.linkedin_url,
      matched_factors: Array.isArray(v?.matched_factors) ? v.matched_factors : [],
      confidence,
      // The evidence trail. The presentation prompt keeps this out of the list
      // and prints it only when the recruiter asks about one person.
      availability_signal: cand.availability_signal,
      signal_date: cand.signal_date,
      availability_current: Boolean(v?.availability_current),
      mobility_evidence: cand.mobility_evidence,
      evidence_sources: cand.evidence_sources,
      discovery_routes: cand.discovery_routes,
      unverified: Array.isArray(v?.unverified) ? v.unverified : [],
    };
    if (v?.verified && confidence >= minConfidence) {
      matched.push(shaped);
      continue;
    }
    unconfirmed.push({
      ...shaped,
      unconfirmed_factors: Array.isArray(v?.missing_factors) ? v.missing_factors : [],
    });
  }

  // Strongest evidence first inside each tier. The tiers themselves are the
  // ranking the recruiter reads top to bottom: advertising they are free,
  // then confirmed against the criteria, then found but unproven.
  const byConfidence = (x, y) => y.confidence - x.confidence;
  const available = matched.filter((p) => p.availability_current).sort(byConfidence);
  const others = matched.filter((p) => !p.availability_current).sort(byConfidence);
  unconfirmed.sort(byConfidence);

  return {
    result: {
      query,
      criteria,
      available,
      others,
      unconfirmed,
      routes: activeRoutes.map((r) => r.key),
      signal_max_age_days: signalMaxAgeDays,
      checked_count: candidates.length,
      presentation: c.finder_compress_instructions,
    },
    usage,
  };
}
