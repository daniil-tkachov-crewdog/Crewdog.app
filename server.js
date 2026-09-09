// Single Render Web Service: serves the built frontend (dist/) AND the chat API.
// The OpenAI key stays here on the server and never reaches the browser.
import express from "express";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { PDFParse } from "pdf-parse";
import { runJobSearch } from "./agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// Raised from 1mb to accommodate base64-encoded CV uploads.
app.use(express.json({ limit: "15mb" }));

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

// POST /api/extract-cv  { dataBase64, filename? }
// Decodes an uploaded PDF (CV) into plain text so the frontend can attach it
// to the user's chat prompt. Returns { text, filename, chars }.
app.post("/api/extract-cv", async (req, res) => {
  try {
    const { dataBase64, filename } = req.body ?? {};
    if (typeof dataBase64 !== "string" || !dataBase64) {
      return res.status(400).json({ error: "dataBase64 is required" });
    }

    // Strip an optional data: URL prefix (e.g. "data:application/pdf;base64,").
    const b64 = dataBase64.includes(",") ? dataBase64.split(",").pop() : dataBase64;
    let buf;
    try {
      buf = Buffer.from(b64, "base64");
    } catch {
      return res.status(400).json({ error: "Invalid base64 data" });
    }

    // Size guard (10 MB) and PDF signature check.
    if (buf.length > 10 * 1024 * 1024) {
      return res.status(413).json({ error: "File too large (max 10MB)" });
    }
    if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return res.status(400).json({ error: "Only PDF files are supported" });
    }

    const parser = new PDFParse({ data: new Uint8Array(buf) });
    let text = "";
    try {
      const result = await parser.getText();
      text = String(result?.text ?? "");
    } finally {
      await parser.destroy?.();
    }

    // Drop pdf-parse page markers like "-- 1 of 3 --" and collapse blank runs.
    text = text
      .replace(/^-- \d+ of \d+ --$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!text) {
      return res
        .status(422)
        .json({ error: "Couldn't read any text from this PDF." });
    }

    res.json({ text, filename: filename || "CV.pdf", chars: text.length });
  } catch (err) {
    console.error("[/api/extract-cv]", err?.message || err);
    res.status(500).json({ error: "Could not read the PDF." });
  }
});

// POST /api/chat  { messages: [{role, content}], model?, webSearch? }
app.post("/api/chat", async (req, res) => {
  try {
    const {
      messages,
      model,
      webSearch,
      fileSearch,
      systemPrompt: sysOverride,
      userPromptAddition,
      agent,
    } = req.body ?? {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages[] is required" });
    }

    const activeModel = model || DEFAULT_MODEL;
    const agentEnabled = !!agent?.enabled;

    const tools = [];
    if (webSearch) tools.push({ type: "web_search" });
    if (fileSearch) tools.push({ type: "file_search" });
    if (agentEnabled) {
      tools.push({
        type: "function",
        name: "find_linkedin_connections",
        description:
          "Find relevant LinkedIn profiles (HR/recruiters and potential connections). Call this whenever the user pastes a job description, OR whenever they directly ask to find people/recruiters/connections (e.g. 'find recruiters at Spotify in Berlin'). Pass the job description when there is one; otherwise pass whatever company/role/location the user specified.",
        parameters: {
          type: "object",
          properties: {
            job_description: {
              type: "string",
              description: "The full job description text, if the user provided one. Leave empty for a direct connection search.",
            },
            company: {
              type: "string",
              description: "Target company, when no job description is given.",
            },
            role: {
              type: "string",
              description: "Role/title of interest, when no job description is given.",
            },
            location: {
              type: "string",
              description: "Location to focus the search on, when no job description is given.",
            },
          },
          required: [],
          additionalProperties: false,
        },
      });
    }

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

    const usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
    const bumpUsage = (r) => {
      const u = r?.usage ?? {};
      usage.input_tokens += u.input_tokens ?? 0;
      usage.output_tokens += u.output_tokens ?? 0;
      usage.total_tokens += u.total_tokens ?? 0;
    };

    let response = await openai.responses.create({
      model: activeModel,
      instructions,
      input,
      tools: tools.length ? tools : undefined,
    });
    bumpUsage(response);

    // Tool-call loop: run the agent pipeline when the model asks for it.
    for (let hop = 0; hop < 3; hop++) {
      const calls = (response.output ?? []).filter(
        (o) => o.type === "function_call" && o.name === "find_linkedin_connections"
      );
      if (!calls.length) break;

      const toolOutputs = [];
      for (const call of calls) {
        let out;
        try {
          const args = JSON.parse(call.arguments || "{}");
          const { result, usage: pu } = await runJobSearch(
            openai,
            args,
            agent?.config ?? {},
            activeModel
          );
          usage.input_tokens += pu.input_tokens;
          usage.output_tokens += pu.output_tokens;
          usage.total_tokens += pu.total_tokens;
          out = JSON.stringify(result);
        } catch (e) {
          out = JSON.stringify({ error: String(e?.message || e) });
        }
        toolOutputs.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: out,
        });
      }

      response = await openai.responses.create({
        model: activeModel,
        previous_response_id: response.id,
        input: toolOutputs,
        tools: tools.length ? tools : undefined,
      });
      bumpUsage(response);
    }

    res.json({
      reply: response.output_text ?? "",
      model: activeModel,
      usage,
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
