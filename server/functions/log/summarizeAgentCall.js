// server/functions/log/summarizeAgentCall.js
//
// Reduces one workflow run to a log-sized record.

/**
 * Summarise a tool call for the chat log: the criteria the model chose, and
 * how many results survived each stage.
 *
 * Deliberately counts, not people — the log exists to diagnose the pipeline,
 * not to store anyone's profile. Every free-text field is truncated for the
 * same reason.
 *
 * @param {string} name   The tool name, e.g. "find_jobs".
 * @param {object} args   The arguments the model passed.
 * @param {object} result What the workflow returned.
 * @returns {object}      A flat row for the agent_calls column.
 */
export function summarizeAgentCall(name, args, result) {
  const row = { tool: name };
  if (name === "find_accommodation") {
    row.location = String(args?.location ?? "").slice(0, 120);
    row.place_type = String(args?.place_type ?? "").slice(0, 80);
    row.budget = String(args?.budget ?? "").slice(0, 80);
    row.requirements = (Array.isArray(args?.requirements) ? args.requirements : [])
      .map((f) => String(f ?? "").slice(0, 80))
      .slice(0, 10);
    row.listing_type = String(result?.listing_type ?? "");
    row.found = result?.found_count ?? 0;
    row.returned = result?.places?.length ?? 0;
  } else if (name === "find_jobs") {
    row.request = String(args?.request ?? "").slice(0, 200);
    row.found = result?.found_count ?? 0;
    row.returned = result?.jobs?.length ?? 0;
    row.direct = result?.direct_count ?? 0;
    row.board = result?.board_count ?? 0;
    // Why the ones that did not make it did not make it.
    row.dropped = result?.dropped ?? null;
    row.link_check = result?.link_check?.skipped
      ? "skipped"
      : {
          checked: result?.link_check?.checked ?? 0,
          dead: result?.link_check?.dead ?? 0,
          unknown: result?.link_check?.unknown ?? 0,
        };
  } else if (name === "find_linkedin_professionals") {
    row.request = String(args?.request ?? "").slice(0, 200);
    row.found = result?.found_count ?? 0;
    row.returned = result?.people?.length ?? 0;
  } else {
    row.had_job_description = Boolean(String(args?.job_description ?? "").trim());
    row.company = String(result?.extracted?.company ?? "").slice(0, 120);
    row.location = String(result?.extracted?.location ?? "").slice(0, 120);
    row.returned = result?.contacts?.length ?? 0;
  }
  if (result?.error) row.error = String(result.error).slice(0, 120);
  return row;
}
