// Workflow 2 — "LinkedIn finder" pipeline.
// title + location (+ any extra key factors) -> LinkedIn-domain web search ->
// enrich/dedupe -> verify each profile against the key factors -> compressed list.
//
// Unlike workflow 1 (agent.js) this never needs a job description: a recruiter
// just asks for people. LinkedIn authwalls anonymous profile GETs, so the
// evidence the verifier works from is the search result itself; `enrich()` is
// the seam where a real scraper or profile API would slot in later.

import { outputText, addUsage, parseJson } from "./agent.js";
import { LINKEDIN_FINDER_DEFAULTS as DEFAULTS } from "./agentPrompts.js";

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

// Dedupe + shape the raw search hits. Today this only reshapes what the search
// already returned; a scraper would fill `evidence` with fetched page text.
function enrich(candidates, limit) {
  const seen = new Set();
  const out = [];
  for (const cand of candidates) {
    const url = normalizeUrl(cand?.linkedin_url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({
      name: String(cand?.name ?? "").trim(),
      headline: String(cand?.headline ?? "").trim(),
      title: String(cand?.title ?? "").trim(),
      company: String(cand?.company ?? "").trim(),
      location: String(cand?.location ?? "").trim(),
      linkedin_url: url,
      evidence: String(cand?.snippet ?? cand?.headline ?? "").trim(),
    });
    if (out.length >= limit) break;
  }
  return out;
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
  const query = buildQuery(jobTitle, location, keyFactors);
  const criteria = { job_title: jobTitle, location, key_factors: keyFactors };

  // 2) Web search, restricted to LinkedIn profile URLs.
  const searchResp = await openai.responses.create({
    model,
    instructions: c.finder_search_instructions,
    tools: [{ type: "web_search" }],
    input:
      `Find up to ${maxResults} real LinkedIn member profiles (linkedin.com/in/) matching these criteria.\n` +
      `Job title: ${jobTitle}\n` +
      `Location: ${location}\n` +
      (keyFactors.length ? `Other key factors: ${keyFactors.join(", ")}\n` : "") +
      `Common extra factors to watch for: ${c.finder_extra_factor_hints}\n\n` +
      `Run this query (and sensible variations of it):\n${query}\n\n` +
      `Return ONLY JSON: {"candidates":[{"name":string,"headline":string,"title":string,"company":string,"location":string,"linkedin_url":string,"snippet":string}]}`,
  });
  addUsage(usage, searchResp);
  const searchOut = parseJson(outputText(searchResp), { candidates: [] });
  const rawCandidates = Array.isArray(searchOut.candidates) ? searchOut.candidates : [];

  // 3) Enrich: dedupe, drop non-profile URLs, keep the snippet as evidence.
  const candidates = enrich(rawCandidates, maxResults);
  if (!candidates.length) {
    return {
      result: { query, criteria, profiles: [], dropped_count: rawCandidates.length, checked_count: 0 },
      usage,
    };
  }

  // 4) Verify each candidate against every key factor.
  const verifyResp = await openai.responses.create({
    model,
    instructions: c.finder_verify_instructions,
    input:
      `Criteria:\n` +
      `- job title: ${jobTitle}\n` +
      `- location: ${location}\n` +
      keyFactors.map((f) => `- ${f}`).join("\n") +
      `\n\nCandidates (evidence is the search snippet for that profile):\n` +
      JSON.stringify(candidates, null, 1) +
      `\n\nFor every candidate, return ONLY JSON: {"results":[{"linkedin_url":string,"verified":boolean,"matched_factors":string[],"missing_factors":string[],"confidence":number,"reason":string}]}`,
  });
  addUsage(usage, verifyResp);
  const verifyOut = parseJson(outputText(verifyResp), { results: [] });
  const verdicts = new Map(
    (Array.isArray(verifyOut.results) ? verifyOut.results : []).map((r) => [
      normalizeUrl(r?.linkedin_url),
      r,
    ])
  );

  // 5) Compress: keep the ones that passed, drop the verifier's working notes.
  const profiles = [];
  for (const cand of candidates) {
    const v = verdicts.get(cand.linkedin_url);
    const confidence = Number(v?.confidence ?? 0);
    if (!v?.verified || confidence < minConfidence) continue;
    profiles.push({
      name: cand.name,
      title: cand.title || cand.headline,
      company: cand.company,
      location: cand.location,
      linkedin_url: cand.linkedin_url,
      matched_factors: Array.isArray(v.matched_factors) ? v.matched_factors : [],
      confidence,
    });
    if (profiles.length >= maxResults) break;
  }

  return {
    result: {
      query,
      criteria,
      profiles,
      checked_count: candidates.length,
      dropped_count: candidates.length - profiles.length,
      presentation: c.finder_compress_instructions,
    },
    usage,
  };
}
