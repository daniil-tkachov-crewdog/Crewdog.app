// Workflow 2 — "LinkedIn finder".
//
// One prompt, one call. The chat model passes on what the user asked for, the
// whole conversation goes with it, and the admin's single prompt (see
// agentPrompts.js) is injected as the instructions every time — so "none of
// these are good, find more" is just another run with the history in front of
// it.
//
// The only thing this file adds to the prompt is plumbing: the JSON shape the
// result cards need, and a dedupe pass on the profile URL. LinkedIn authwalls
// anonymous profile GETs, so the search result is all the evidence there is.

import { outputText, addUsage, parseJson, render, today } from "./agent.js";
import { LINKEDIN_FINDER_DEFAULTS as DEFAULTS } from "./agentPrompts.js";

// linkedin.com/in/<slug> — anything else (company pages, job posts, search
// result pages, other domains) is not a person and gets dropped.
const PROFILE_RE = /^https?:\/\/([a-z0-9-]+\.)*linkedin\.com\/in\/[^/?#\s]+/i;

// Strip tracking params, trailing slashes and the locale subdomain so the same
// person found twice under different URLs collapses to one row. Exported
// because the contact-lookup cache keys on it too: the same person has to be
// one cache row for the same reason they are one row here.
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
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

const str = (v) => String(v ?? "").trim();

export async function runLinkedinFinder(
  openai,
  args = {},
  cfg = {},
  model = "gpt-4o",
  ctx = {}
) {
  const usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0, requests: 0 };

  const c = { ...DEFAULTS, ...cfg };
  const request = str(args?.request);
  // Every one of these is an editable field in the admin panel.
  const prompt = str(c.linkedin_finder_prompt) || DEFAULTS.linkedin_finder_prompt;
  const outputContract =
    str(c.linkedin_finder_output_contract) || DEFAULTS.linkedin_finder_output_contract;
  const runInstruction =
    str(c.linkedin_finder_run_instruction) || DEFAULTS.linkedin_finder_run_instruction;
  // The conversation so far, so a follow-up message lands in context rather
  // than starting from nothing.
  const history = Array.isArray(ctx.history) ? ctx.history : [];

  const resp = await openai.responses.create({
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
          output_contract: outputContract,
        }),
      },
    ],
  });
  addUsage(usage, resp);

  const out = parseJson(outputText(resp), { people: [], note: "" });
  const raw = Array.isArray(out?.people) ? out.people : [];

  // One row per profile URL; anything that is not a personal profile goes.
  const byUrl = new Map();
  for (const p of raw) {
    const url = normalizeUrl(p?.linkedin_url);
    if (!url || byUrl.has(url)) continue;
    byUrl.set(url, {
      name: str(p?.name) || nameFromProfileUrl(url),
      title: str(p?.title),
      company: str(p?.company),
      location: str(p?.location),
      linkedin_url: url,
      evidence: str(p?.evidence),
      availability_signal: str(p?.availability_signal),
    });
  }

  return {
    result: {
      request,
      people: [...byUrl.values()],
      found_count: raw.length,
      note: str(out?.note),
    },
    usage,
  };
}
