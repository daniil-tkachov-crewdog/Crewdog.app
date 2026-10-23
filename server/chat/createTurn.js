// server/chat/createTurn.js
//
// The mutable state one chat request accumulates: what it spent, which
// workflows it ran, and what it will write to the chat log on the way out.

import { recordChatCall } from "../chatlog.js";

/**
 * Create the state for one /api/chat request.
 *
 * Every exit from the chat route logs through `turn.log()`, so a turn that
 * spends OpenAI credit always leaves a row whatever it answers — including
 * the ones that fail. `model`, `agent` and `mode` are plain properties rather
 * than captured locals precisely so the branch modules can set them and the
 * log still sees the change.
 *
 * @param {import("express").Request} req
 * @returns {{
 *   usage: {input_tokens:number, output_tokens:number, total_tokens:number,
 *           cached_tokens:number, requests:number},
 *   model: string|null, agent: boolean, mode: string|null,
 *   agentCalls: object[], results: object[],
 *   log: (status: number, error?: unknown) => void,
 *   bumpUsage: (response: object) => void,
 * }}
 */
export function createTurn(req) {
  const startedAt = Date.now();

  const turn = {
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      cached_tokens: 0,
      requests: 0,
    },

    /** Model actually used, once known. Null until the guards have passed. */
    model: null,
    /** Whether any workflow or skill ran this turn. */
    agent: false,
    /** "normal" | "pro". Set before the gates, so a turn refused for auth or
     *  a spent limit still records which mode the user was trying to use. */
    mode: null,

    /**
     * What the model asked each workflow for, and what came back. Without
     * this a disappointing answer is unattributable: you cannot tell a
     * criterion the model silently dropped from one the search could not fill.
     */
    agentCalls: [],

    /** Workflow results the chat page renders as cards beside the reply. */
    results: [],

    log(status, error) {
      recordChatCall(req, {
        model: turn.model,
        agent: turn.agent,
        agentCalls: turn.agentCalls,
        usage: turn.usage,
        status,
        startedAt,
        error,
        mode: turn.mode,
      });
    },

    /** Fold one Responses API reply into the running total. */
    bumpUsage(r) {
      const u = r?.usage ?? {};
      turn.usage.requests += 1;
      turn.usage.input_tokens += u.input_tokens ?? 0;
      turn.usage.output_tokens += u.output_tokens ?? 0;
      turn.usage.total_tokens += u.total_tokens ?? 0;
      // Cached input bills at 10% of the input rate; it is already included
      // in input_tokens, so it is tracked separately and discounted in
      // toUnits().
      turn.usage.cached_tokens += u.input_tokens_details?.cached_tokens ?? 0;
    },
  };

  return turn;
}
