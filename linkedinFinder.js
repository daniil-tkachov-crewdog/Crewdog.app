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
// person found twice under different URLs collapses to one candidate.
function normalizeUrl(url) {
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
        name: str(cand?.name),
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
  // Seats held for people with a live availability signal. The rest of the list
  // is ordinary matches, and unfilled availability seats are given back to them,
  // so a search that finds nobody free still returns a full list of people who
  // can do the job.
  const availableSlots = Math.max(
    0,
    Math.min(maxResults, Number(c.finder_available_slots) || 0)
  );
  // Search wider than we show. Available people are a minority of any result
  // set, so a pool the size of the list cannot reliably fill the seats held for
  // them — the split would collapse to whatever the first few hits happened to
  // be. The extra candidates cost search and verification tokens, not seats.
  const searchPool = maxResults + availableSlots * 2;
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
  const candidates = enrich(searchResps, searchPool);
  if (!candidates.length) {
    return {
      result: {
        query,
        criteria,
        available: [],
        others: [],
        near_misses: [],
        checked_count: 0,
        dropped_count: rawCandidates.length,
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

  // 5) Compress into two lists. Everyone who matches the job goes on the list;
  // the ones with a live availability signal simply go first and get labelled.
  // Near misses now only catch people who failed the job criteria themselves,
  // and are still offered only when the list would otherwise be empty.
  const matched = [];
  const nearMisses = [];
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
    if (nearMisses.length < maxResults) {
      nearMisses.push({
        ...shaped,
        unconfirmed_factors: Array.isArray(v?.missing_factors) ? v.missing_factors : [],
      });
    }
  }

  // Strongest evidence first within each group, then fill the availability
  // seats. Whatever those seats do not use goes back to the ordinary matches,
  // so the list is always as long as the results allow.
  const byConfidence = (x, y) => y.confidence - x.confidence;
  const availablePool = matched.filter((p) => p.availability_current).sort(byConfidence);
  const otherPool = matched.filter((p) => !p.availability_current).sort(byConfidence);

  const available = availablePool.slice(0, availableSlots);
  const others = otherPool.slice(0, maxResults - available.length);
  // Available people beyond their seats are better matches than the ordinary
  // ones they would displace, so they take any room left at the bottom.
  const overflow = availablePool.slice(available.length, available.length + (maxResults - available.length - others.length));

  return {
    result: {
      query,
      criteria,
      available: [...available, ...overflow],
      others,
      // Only offered as a fallback, so a run that found real matches never
      // dilutes them with unverified ones.
      near_misses: matched.length ? [] : nearMisses,
      routes: activeRoutes.map((r) => r.key),
      signal_max_age_days: signalMaxAgeDays,
      checked_count: candidates.length,
      dropped_count: candidates.length - matched.length,
      presentation: c.finder_compress_instructions,
    },
    usage,
  };
}
