// server/chat/runNormalTurn.js
//
// Normal mode: the model answers directly, and calls one of the four
// workflows as a function tool when a message needs one. Results come back
// as cards beside the reply text.

import { openai } from "../integrations/openai/client.js";
import {
  toCardGroup,
  splitSuggestions,
  CARDS_PRESENTATION,
  SUGGESTIONS_CONTRACT,
  SUGGESTIONS_TAIL,
  WORKFLOW_CONTRACT,
} from "../chatResults.js";
import { ROUTING_DEFAULTS } from "../agentPrompts.js";
import { recordUsage } from "../usage.js";
import { loadSystemPrompt } from "../prompts/loadSystemPrompt.js";
import { toModelInput } from "../functions/openai/toModelInput.js";
import { summarizeAgentCall } from "../functions/log/summarizeAgentCall.js";
import { AGENT_HANDLERS } from "./toolRegistry.js";
import { buildChatTools } from "./buildChatTools.js";

/** Tool-call hops allowed before the loop gives up and answers with what it
 *  has. Three covers call-then-answer plus a model that chains searches. */
const MAX_HOPS = 3;

/**
 * Run one Normal-mode turn and send a single JSON body.
 *
 * @param {object} ctx
 * @param {import("express").Request}  ctx.req
 * @param {import("express").Response} ctx.res
 * @param {object} ctx.turn          From createTurn().
 * @param {string} ctx.plan          "free" | "pro".
 * @param {string} ctx.activeModel
 * @param {object[]} ctx.messages
 * @param {boolean} ctx.webSearch
 * @param {boolean} ctx.fileSearch
 * @param {string|undefined} ctx.sysOverride
 * @param {string|undefined} ctx.userPromptAddition
 * @param {object|undefined} ctx.agent  The admin's agent config block.
 * @returns {Promise<void>}
 */
export async function runNormalTurn({
  req,
  res,
  turn,
  plan,
  activeModel,
  messages,
  webSearch,
  fileSearch,
  sysOverride,
  userPromptAddition,
  agent,
}) {
  const agentEnabled = !!agent?.enabled;
  const finderEnabled = !!agent?.linkedin_finder_enabled;
  const jobFinderEnabled = !!agent?.job_finder_enabled;
  const accomFinderEnabled = !!agent?.accommodation_finder_enabled;
  const anyFinderEnabled =
    agentEnabled || finderEnabled || jobFinderEnabled || accomFinderEnabled;

  turn.model = activeModel;
  turn.agent = anyFinderEnabled;

  const routing = { ...ROUTING_DEFAULTS, ...(agent?.config ?? {}) };

  const tools = buildChatTools({
    routing,
    webSearch,
    fileSearch,
    agentEnabled,
    finderEnabled,
    jobFinderEnabled,
    accomFinderEnabled,
  });

  const baseInstructions =
    (typeof sysOverride === "string" && sysOverride.trim()) ||
    loadSystemPrompt() ||
    "";
  // Two contracts between the model and the app — results arrive as cards, and
  // the next steps are buttons rather than a question in the prose. Both are
  // appended to whatever system prompt the admin has set rather than living in
  // the editable text, so neither can be edited away.
  const workflowContract =
    String(routing.chat_workflow_contract ?? "").trim() || WORKFLOW_CONTRACT;
  const suggestionsContract =
    String(routing.chat_suggestions_contract ?? "").trim() || SUGGESTIONS_CONTRACT;
  const instructions = anyFinderEnabled
    ? `${baseInstructions}\n\n${workflowContract}\n\n${suggestionsContract}`.trim()
    : `${baseInstructions}\n\n${suggestionsContract}`.trim();

  const addition =
    typeof userPromptAddition === "string" ? userPromptAddition.trim() : "";

  const input = toModelInput(messages);
  // Attach the hidden instruction to the latest user message (invisible to
  // the user).
  if (addition) {
    for (let i = input.length - 1; i >= 0; i--) {
      if (input[i].role === "user") {
        input[i] = { ...input[i], content: `${input[i].content}\n\n${addition}` };
        break;
      }
    }
  }

  let response = await openai.responses.create({
    model: activeModel,
    instructions,
    input,
    tools: tools.length ? tools : undefined,
  });
  turn.bumpUsage(response);

  // Tool-call loop: run the agent pipeline when the model asks for it.
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const calls = (response.output ?? []).filter(
      (o) => o.type === "function_call" && AGENT_HANDLERS[o.name]
    );
    if (!calls.length) break;

    const toolOutputs = [];
    for (const call of calls) {
      let out;
      try {
        const args = JSON.parse(call.arguments || "{}");
        const { result, usage: pu } = await AGENT_HANDLERS[call.name](
          openai,
          args,
          agent?.config ?? {},
          activeModel,
          // The LinkedIn and job finders are one prompt re-injected per
          // message, so they need the same conversation the chat model has.
          { history: input }
        );
        turn.usage.input_tokens += pu.input_tokens;
        turn.usage.output_tokens += pu.output_tokens;
        turn.usage.total_tokens += pu.total_tokens;
        turn.usage.requests += pu.requests ?? 0;
        turn.agentCalls.push(summarizeAgentCall(call.name, args, result));
        // Shown as cards, the list must not be printed again in the text.
        const group = toCardGroup(call.name, args, result);
        if (group) turn.results.push(group);
        // Whatever tells the model how to present this result is also what
        // tells it to stop writing, so the suggestions exemption is pinned to
        // the end of it rather than left in the system prompt to be overruled.
        const cardsPresentation =
          String(routing.chat_cards_presentation ?? "").trim() || CARDS_PRESENTATION;
        const suggestionsTail =
          String(routing.chat_suggestions_tail ?? "").trim() || SUGGESTIONS_TAIL;
        const presentation = `${
          group ? cardsPresentation : result?.presentation ?? ""
        }\n\n${suggestionsTail}`.trim();
        out = JSON.stringify({ ...result, presentation });
      } catch (e) {
        turn.agentCalls.push({
          tool: call.name,
          error: String(e?.message || e).slice(0, 300),
        });
        out = JSON.stringify({ error: String(e?.message || e) });
      }
      toolOutputs.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: out,
      });
    }

    // `instructions` is NOT inherited through previous_response_id — the API
    // drops it so a caller can swap the system message per turn. Omitting it
    // here ran every tool-using reply, which is the reply the user actually
    // reads, with no system prompt at all: no industry scope, no presentation
    // rules, no suggested next steps. It has to be resent on every hop.
    response = await openai.responses.create({
      model: activeModel,
      instructions,
      previous_response_id: response.id,
      input: toolOutputs,
      tools: tools.length ? tools : undefined,
    });
    turn.bumpUsage(response);
  }

  // Commit what this turn actually cost — chat hops and the job-search
  // pipeline alike, since `usage` accumulates both.
  const committed = await recordUsage(req.accessToken, plan, turn.usage);

  // The suggestions ride back in the reply text; split them out so the page
  // gets buttons and the stored message stays clean prose.
  const { text: replyText, suggestions } = splitSuggestions(
    response.output_text ?? ""
  );

  turn.log(200);
  res.json({
    reply: replyText,
    suggestions,
    results: turn.results,
    model: activeModel,
    usage: turn.usage,
    limits: committed ?? undefined,
  });
}
