// server/chat/runProTurn.js
//
// Pro mode: no sub-agents. The model searches the web itself and writes the
// cards itself, under a strict JSON schema.
//
// What it does NOT carry is the detail of how to run each kind of search —
// that lives in the skills table and arrives through load_skill, so a "hello"
// costs a few hundred characters of context instead of thirty thousand.
//
// Pro answers over SSE rather than a single JSON body, purely so the skill
// loading is visible while it happens. The final `done` event carries the
// exact payload Normal mode returns, so nothing downstream changes.

import { openai } from "../integrations/openai/client.js";
import {
  listSkills,
  getSkillPrompts,
  renderSkillMenu,
} from "../proSkills.js";
import { fromProJson } from "../chatResults.js";
import { recordUsage } from "../usage.js";
import { toModelInput } from "../functions/openai/toModelInput.js";
import { buildProFormat } from "../functions/openai/buildProFormat.js";

/** Hops allowed after the first reply. One covers load-then-answer; the rest
 *  cover a model that realises mid-turn it needs another skill. */
const MAX_HOPS = 3;

const SKILLS_DOWN =
  "Crewdog can't reach its skills right now. Try again in a moment.";

/**
 * Run one Pro-mode turn, writing the whole response as an SSE stream.
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
 * @param {string|object|undefined} ctx.jsonSchema
 * @param {string[]|undefined} ctx.clientLoadedSkills
 * @returns {Promise<void>} Resolves once the response has been ended.
 */
export async function runProTurn({
  req,
  res,
  turn,
  plan,
  activeModel,
  messages,
  webSearch,
  fileSearch,
  sysOverride,
  jsonSchema,
  clientLoadedSkills,
}) {
  turn.model = activeModel;

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  const fail = (status, code, message, error) => {
    turn.log(status, error ?? message);
    send({ type: "error", code, error: message });
    res.end();
  };

  let menu;
  try {
    menu = await listSkills(req.accessToken);
  } catch (err) {
    // Without the menu the model does not know a skill exists, so it would
    // answer from the core prompt alone and quietly produce nothing. Stop.
    return fail(503, "skills_unavailable", SKILLS_DOWN, err?.message || err);
  }

  const slugs = menu.map((m) => m.slug);
  const nameOf = (slug) => menu.find((m) => m.slug === slug)?.name ?? slug;

  // Skills already loaded earlier in this conversation. The server holds no
  // session, so the page carries them forward and they are re-injected up
  // front — that is what makes "any more?" cost no second load.
  const loaded = [
    ...new Set((clientLoadedSkills ?? []).filter((x) => slugs.includes(x))),
  ];

  let carried = [];
  if (loaded.length) {
    try {
      carried = await getSkillPrompts(req.accessToken, loaded);
    } catch (err) {
      return fail(503, "skills_unavailable", SKILLS_DOWN, err?.message || err);
    }
  }

  const buildInstructions = (skillBodies) =>
    [
      String(sysOverride ?? "").trim(),
      renderSkillMenu(menu),
      ...skillBodies.map(
        (b) => `LOADED SKILL — ${b.name.toUpperCase()}\n\n${b.prompt}`
      ),
    ]
      .filter(Boolean)
      .join("\n\n");

  const proTools = [];
  if (webSearch) proTools.push({ type: "web_search" });
  if (fileSearch) proTools.push({ type: "file_search" });
  if (slugs.length) {
    proTools.push({
      type: "function",
      name: "load_skill",
      description:
        "Load the full instructions for one or more Crewdog skills. Call this before searching or answering whenever a message needs a skill, and ask for every skill you need in a single call.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["skills"],
        properties: {
          skills: {
            type: "array",
            description: "The slugs of the skills to load.",
            items: { type: "string", enum: slugs },
          },
        },
      },
    });
  }

  const bodies = [...carried];
  const format = buildProFormat(jsonSchema);

  let response = await openai.responses.create({
    model: activeModel,
    instructions: buildInstructions(bodies),
    input: toModelInput(messages),
    tools: proTools.length ? proTools : undefined,
    text: { format },
  });
  turn.bumpUsage(response);

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const calls = (response.output ?? []).filter(
      (o) => o.type === "function_call" && o.name === "load_skill"
    );
    if (!calls.length) break;

    const toolOutputs = [];
    for (const call of calls) {
      let asked = [];
      try {
        asked = JSON.parse(call.arguments || "{}")?.skills ?? [];
      } catch {
        asked = [];
      }
      const fresh = asked.filter((x) => slugs.includes(x) && !loaded.includes(x));

      for (const slug of fresh) {
        send({ type: "status", text: `Loading ${nameOf(slug)}…` });
      }

      let fetched = [];
      if (fresh.length) {
        try {
          fetched = await getSkillPrompts(req.accessToken, fresh);
        } catch (err) {
          // Three attempts already failed inside getSkillPrompts. The model
          // asked for instructions it cannot have, so the honest end to the
          // turn is to say so rather than let it improvise.
          return fail(503, "skills_unavailable", SKILLS_DOWN, err?.message || err);
        }
      }

      for (const b of fetched) {
        if (!loaded.includes(b.slug)) loaded.push(b.slug);
        bodies.push(b);
        send({ type: "status", text: `${b.name} loaded` });
      }
      turn.agentCalls.push({
        tool: "load_skill",
        skills: fetched.map((b) => b.slug),
      });

      toolOutputs.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: fetched.length
          ? fetched.map((b) => `SKILL — ${b.name}\n\n${b.prompt}`).join("\n\n---\n\n")
          : "Already loaded, or no such skill. Use what you have.",
      });
    }

    // `instructions` is not inherited through previous_response_id, and the
    // skills now live in it, so it is rebuilt and resent on every hop.
    response = await openai.responses.create({
      model: activeModel,
      instructions: buildInstructions(bodies),
      previous_response_id: response.id,
      input: toolOutputs,
      tools: proTools.length ? proTools : undefined,
      text: { format },
    });
    turn.bumpUsage(response);
  }

  turn.agent = loaded.length > 0;
  const committed = await recordUsage(req.accessToken, plan, turn.usage);
  const raw = response.output_text ?? "";

  let payload = null;
  try {
    payload = fromProJson(JSON.parse(raw));
  } catch {
    /* handled below */
  }

  if (!payload) {
    // Strict mode makes an off-schema answer impossible, so getting here
    // means the model refused or the output was cut short. The tokens are
    // spent either way, so hand back whatever words came out rather than
    // swallowing the turn — and log it as a failure so it is visible.
    turn.log(502, "pro: output was not parseable JSON");
    send({
      type: "done",
      reply: raw,
      suggestions: [],
      results: [],
      loadedSkills: loaded,
      model: activeModel,
      usage: turn.usage,
      limits: committed ?? undefined,
    });
    return void res.end();
  }

  // Cards are built from rules that live in the skills. If the model never
  // loaded one and produced results anyway, it invented the shape from the
  // core prompt — drop them, so a missed skill shows up as a missing card
  // rather than a plausible wrong one.
  const results = loaded.length ? payload.results : [];
  if (!loaded.length && payload.results.length) {
    console.warn("[pro] dropped results built with no skill loaded");
  }

  turn.log(200);
  send({
    type: "done",
    reply: payload.reply,
    suggestions: payload.suggestions,
    results,
    loadedSkills: loaded,
    model: activeModel,
    usage: turn.usage,
    limits: committed ?? undefined,
  });
  return void res.end();
}
