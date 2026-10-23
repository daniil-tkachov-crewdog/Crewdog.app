// server/routes/models.route.js
//
// GET /api/models — the chat models the admin panel can choose from, read
// live from OpenAI so the list stays current without a deploy.

import { Router } from "express";
import { openai } from "../integrations/openai/client.js";

export const modelsRoute = Router();

modelsRoute.get("/models", async (_req, res) => {
  try {
    const list = await openai.models.list();
    // Chat-capable families only: the account also has embedding, image and
    // audio models, none of which belong in a chat model picker.
    const ids = (list?.data ?? [])
      .map((m) => m.id)
      .filter((id) => /^(gpt|o\d|chatgpt)/i.test(id))
      .sort();
    res.json({ models: ids });
  } catch (err) {
    console.error("[/api/models]", err?.message || err);
    res.status(500).json({ error: "Could not load models" });
  }
});
