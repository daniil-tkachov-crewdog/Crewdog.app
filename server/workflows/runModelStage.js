// server/workflows/runModelStage.js
//
// One step of a workflow: ask the model something, count what it cost, and
// read the JSON back out.
//
// This is the piece the four workflows genuinely share. It is deliberately
// not a pipeline: a six-stage runner over buildPrompt → callModel →
// parseResults → normalizeResults → filterResults → verifyResults was
// considered and rejected. The three finders look alike in outline but
// diverge in substance — the LinkedIn finder never checks links, the
// accommodation finder refuses outright when the criteria are too thin, the
// job finder splits results into direct and board and keeps per-reason drop
// counts — and the job-description workflow is four chained calls that fit
// no such shape at all. Expressing that as one runner needs a configuration
// object with more optional hooks than the three bodies have lines in
// common. See docs/RESTRUCTURE.md §6.

import { addUsage } from "../functions/openai/addUsage.js";
import { outputText } from "../functions/openai/outputText.js";
import { parseJsonOrDefault } from "../functions/json/parseJsonOrDefault.js";

/**
 * Run one model call and fold its cost into the workflow's usage total.
 *
 * @param {object} opts
 * @param {object} opts.openai        The shared client.
 * @param {string} opts.model
 * @param {string} opts.instructions  System prompt for this stage.
 * @param {string|object[]} opts.input  A string, or Responses API input items.
 * @param {object[]} [opts.tools]     Omitted entirely when not given, so the
 *                                    wire payload matches a call that never
 *                                    mentioned tools.
 * @param {object} opts.usage         Mutated in place by addUsage.
 * @param {unknown} [opts.fallback]   When provided, the reply is parsed as
 *                                    JSON and this is used if it will not
 *                                    parse. When omitted, no parsing happens
 *                                    and `data` is undefined.
 * @returns {Promise<{resp: object, text: string, data: unknown}>}
 */
export async function runModelStage({
  openai,
  model,
  instructions,
  input,
  tools,
  usage,
  fallback,
}) {
  const resp = await openai.responses.create({
    model,
    instructions,
    ...(tools ? { tools } : {}),
    input,
  });
  addUsage(usage, resp);

  const text = outputText(resp);
  return {
    resp,
    text,
    data: fallback === undefined ? undefined : parseJsonOrDefault(text, fallback),
  };
}
