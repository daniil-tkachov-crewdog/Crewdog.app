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

import { runModelStage } from "./workflows/runModelStage.js";
import { renderTemplate as render } from "./functions/text/renderTemplate.js";
import { today } from "./functions/date/today.js";
import { LINKEDIN_FINDER_DEFAULTS as DEFAULTS } from "./agentPrompts.js";

// linkedin.com/in/<slug> — anything else (company pages, job posts, search
// result pages, other domains) is not a person and gets dropped.
import { str } from "./functions/text/str.js";
import { normalizeLinkedinProfileUrl } from "./functions/url/normalizeLinkedinProfileUrl.js";
import { nameFromProfileUrl } from "./functions/url/nameFromProfileUrl.js";

// Kept as a local alias so the body below reads as it always has.
const normalizeUrl = normalizeLinkedinProfileUrl;

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
          output_contract: outputContract,
        }),
      },
    ],
    usage,
    fallback: { people: [], note: "" },
  });
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
