// server/chat/toolRegistry.js
//
// The one place a tool name maps to the workflow that runs it.

import { runJobSearch } from "../agent.js";
import { runLinkedinFinder } from "../linkedinFinder.js";
import { runJobFinder } from "../jobFinder.js";
import { runAccommodationFinder } from "../accommodationFinder.js";

/**
 * Function tools the chat model can call, by name.
 *
 * Each takes (openai, args, config, model, ctx) and resolves to
 * { result, usage }. A name absent from this table is ignored by the tool
 * loop rather than erroring — the model occasionally invents one, and that
 * is not a reason to fail the user's turn.
 */
export const AGENT_HANDLERS = {
  find_linkedin_connections: runJobSearch,
  find_linkedin_professionals: runLinkedinFinder,
  find_jobs: runJobFinder,
  find_accommodation: runAccommodationFinder,
};
