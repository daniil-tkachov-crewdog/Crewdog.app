// server/chat/buildChatTools.js
//
// Builds the tool list Normal mode advertises to the model, from the admin's
// agent configuration.

import { ROUTING_DEFAULTS, TOOL_PARAM_DEFAULTS } from "../agentPrompts.js";

/**
 * Read one tool description from the admin config, falling back to the
 * built-in default when it is blank.
 *
 * Tool descriptions are prompts too — the model reads them to decide which
 * workflow a message belongs to — which is why they are admin-editable at
 * all.
 */
function toolDescription(routing, key) {
  return String(routing[key] ?? "").trim() || ROUTING_DEFAULTS[key];
}

/**
 * Read one argument description out of a tool's JSON blob.
 *
 * Argument descriptions arrive as one JSON object per tool. An unparseable
 * edit falls back to the defaults and then to "": a bad paste in the panel
 * must not take the workflow down with it.
 */
function toolParam(routing, key, field) {
  for (const src of [routing[key], TOOL_PARAM_DEFAULTS[key]]) {
    try {
      const v = JSON.parse(String(src ?? ""))?.[field];
      if (typeof v === "string" && v.trim()) return v;
    } catch {
      /* try the default next */
    }
  }
  return "";
}

/**
 * Assemble the Responses API `tools` array for a Normal-mode turn.
 *
 * Order matters only in that it is stable: web and file search first, then
 * the four workflows in the order the admin toggles appear.
 *
 * @param {object}  opts
 * @param {object}  opts.routing     ROUTING_DEFAULTS merged with agent.config.
 * @param {boolean} opts.webSearch
 * @param {boolean} opts.fileSearch
 * @param {boolean} opts.agentEnabled        find_linkedin_connections
 * @param {boolean} opts.finderEnabled       find_linkedin_professionals
 * @param {boolean} opts.jobFinderEnabled    find_jobs
 * @param {boolean} opts.accomFinderEnabled  find_accommodation
 * @returns {object[]} Possibly empty; the caller sends undefined instead of [].
 */
export function buildChatTools({
  routing,
  webSearch,
  fileSearch,
  agentEnabled,
  finderEnabled,
  jobFinderEnabled,
  accomFinderEnabled,
}) {
  const tools = [];
  if (webSearch) tools.push({ type: "web_search" });
  if (fileSearch) tools.push({ type: "file_search" });

  if (agentEnabled) {
    tools.push({
      type: "function",
      name: "find_linkedin_connections",
      description: toolDescription(routing, "tool_find_linkedin_connections"),
      parameters: {
        type: "object",
        properties: {
          job_description: {
            type: "string",
            description: toolParam(
              routing,
              "tool_params_find_linkedin_connections",
              "job_description"
            ),
          },
        },
        required: ["job_description"],
        additionalProperties: false,
      },
    });
  }

  if (finderEnabled) {
    tools.push({
      type: "function",
      name: "find_linkedin_professionals",
      description: toolDescription(routing, "tool_find_linkedin_professionals"),
      parameters: {
        type: "object",
        properties: {
          request: {
            type: "string",
            description: toolParam(
              routing,
              "tool_params_find_linkedin_professionals",
              "request"
            ),
          },
        },
        required: ["request"],
        additionalProperties: false,
      },
    });
  }

  if (jobFinderEnabled) {
    tools.push({
      type: "function",
      name: "find_jobs",
      description: toolDescription(routing, "tool_find_jobs"),
      parameters: {
        type: "object",
        properties: {
          request: {
            type: "string",
            description: toolParam(routing, "tool_params_find_jobs", "request"),
          },
        },
        required: ["request"],
        additionalProperties: false,
      },
    });
  }

  if (accomFinderEnabled) {
    tools.push({
      type: "function",
      name: "find_accommodation",
      description: toolDescription(routing, "tool_find_accommodation"),
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: toolParam(routing, "tool_params_find_accommodation", "location"),
          },
          place_type: {
            type: "string",
            description: toolParam(routing, "tool_params_find_accommodation", "place_type"),
          },
          budget: {
            type: "string",
            description: toolParam(routing, "tool_params_find_accommodation", "budget"),
          },
          move_in_date: {
            type: "string",
            description: toolParam(routing, "tool_params_find_accommodation", "move_in_date"),
          },
          requirements: {
            type: "array",
            items: { type: "string" },
            description: toolParam(routing, "tool_params_find_accommodation", "requirements"),
          },
        },
        required: ["location", "place_type", "budget", "move_in_date", "requirements"],
        additionalProperties: false,
      },
    });
  }

  return tools;
}
