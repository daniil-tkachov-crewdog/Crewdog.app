// Single Render Web Service: serves the built frontend (dist/) AND the chat API.
// The OpenAI key stays here on the server and never reaches the browser.
import express from "express";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "1mb" }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

// System prompt lives in app/prompts/system.md so it can be edited without code changes.
function systemPrompt() {
  try {
    return readFileSync(path.join(__dirname, "app/prompts/system.md"), "utf8").trim();
  } catch {
    return "";
  }
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// GET /api/models — list all available models from OpenAI (kept fresh automatically).
app.get("/api/models", async (_req, res) => {
  try {
    const list = await openai.models.list();
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

// POST /api/chat  { messages: [{role, content}], model?, webSearch? }
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, model, webSearch, fileSearch, systemPrompt: sysOverride, userPromptAddition } =
      req.body ?? {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages[] is required" });
    }

    const tools = [];
    if (webSearch) tools.push({ type: "web_search" });
    if (fileSearch) tools.push({ type: "file_search" });

    const instructions =
      (typeof sysOverride === "string" && sysOverride.trim()) ||
      systemPrompt() ||
      undefined;
    const addition = typeof userPromptAddition === "string" ? userPromptAddition.trim() : "";

    const input = messages.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content ?? ""),
    }));
    // Attach the hidden instruction to the latest user message (invisible to the user).
    if (addition) {
      for (let i = input.length - 1; i >= 0; i--) {
        if (input[i].role === "user") {
          input[i] = { ...input[i], content: `${input[i].content}\n\n${addition}` };
          break;
        }
      }
    }

    const response = await openai.responses.create({
      model: model || DEFAULT_MODEL,
      instructions,
      input,
      tools: tools.length ? tools : undefined,
    });

    const u = response.usage ?? {};
    res.json({
      reply: response.output_text ?? "",
      model: model || DEFAULT_MODEL,
      usage: {
        input_tokens: u.input_tokens ?? 0,
        output_tokens: u.output_tokens ?? 0,
        total_tokens: u.total_tokens ?? 0,
      },
    });
  } catch (err) {
    console.error("[/api/chat]", err?.message || err);
    res.status(500).json({ error: "Chat request failed" });
  }
});

// Serve the built SPA and let client-side routing handle everything else.
const dist = path.join(__dirname, "dist");
app.use(express.static(dist));
app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on ${port}`));
