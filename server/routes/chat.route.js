// server/routes/chat.route.js
//
// POST /api/chat — the metered path. Validates, meters, then hands off to
// whichever mode the request asked for.
//
// Everything here is a gate; the two mode modules do the work.

import { Router } from "express";
import { isAdminUser, planForUser, checkLimit } from "../usage.js";
import { DEFAULT_MODEL } from "../integrations/openai/client.js";
import { createTurn } from "../chat/createTurn.js";
import { runNormalTurn } from "../chat/runNormalTurn.js";
import { runProTurn } from "../chat/runProTurn.js";

export const chatRoute = Router();

/**
 * POST /api/chat  { messages: [{role, content}], model?, mode?, webSearch?, … }
 *
 * Every exit is logged server-side (see chatlog.js), so a turn that spends
 * OpenAI credit always leaves a row, whatever it answers.
 */
chatRoute.post("/chat", async (req, res) => {
  const turn = createTurn(req);

  try {
    const {
      messages,
      model,
      webSearch,
      fileSearch,
      systemPrompt: sysOverride,
      userPromptAddition,
      agent,
      mode,
      jsonSchema,
      loadedSkills: clientLoadedSkills,
    } = req.body ?? {};

    // Set before the gates below, so a turn refused for auth or a spent limit
    // still records which mode the user was trying to use.
    turn.mode = mode === "pro" ? "pro" : "normal";

    if (!Array.isArray(messages) || messages.length === 0) {
      turn.log(400);
      return res.status(400).json({ error: "messages[] is required" });
    }

    // Chat costs money per call, so it needs an identity to meter against.
    if (!req.userId) {
      turn.log(401);
      return res
        .status(401)
        .json({ error: "Log in to chat with Crewdog.", code: "auth_required" });
    }

    // Everyone is metered, admins included — an untracked account is a hole in
    // the budget, and the caps are admin-editable if they need to be bigger.
    // Admins do get the Pro-sized allowance.
    const plan = isAdminUser(req.authUser)
      ? "pro"
      : await planForUser(req.userId);

    const limit = await checkLimit(req.accessToken, plan);
    if (limit && limit.allowed === false) {
      turn.log(429);
      return res.status(429).json({
        error:
          limit.exceeded === "week"
            ? "You've used your weekly limit."
            : "You've used your 5-hour limit.",
        code: "limit_reached",
        window: limit.exceeded,
        plan,
        resets_at: limit.resets_at,
        usage: limit,
      });
    }

    const activeModel = model || DEFAULT_MODEL;

    const ctx = {
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
      jsonSchema,
      clientLoadedSkills,
    };

    return mode === "pro" ? await runProTurn(ctx) : await runNormalTurn(ctx);
  } catch (err) {
    console.error("[/api/chat]", err?.message || err);
    // Tokens already spent before the throw still belong in the log.
    turn.log(500, err?.message || err);
    // Pro answers over SSE, so by the time it can throw the headers are often
    // already out and res.status() would throw on top of the original error.
    if (res.headersSent) {
      res.write(
        `data: ${JSON.stringify({ type: "error", error: "Chat request failed" })}\n\n`
      );
      return res.end();
    }
    res.status(500).json({ error: "Chat request failed" });
  }
});
