// Single Render Web Service: serves the built frontend (dist/) AND the chat API.
// The OpenAI key stays here on the server and never reaches the browser.
import express from "express";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { PDFParse } from "pdf-parse";
import { runJobSearch } from "./agent.js";
import {
  attachUser,
  isAdminUser,
  planForUser,
  checkLimit,
  recordUsage,
} from "./usage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// Raised from 1mb to accommodate base64-encoded CV uploads.
app.use(express.json({ limit: "15mb" }));
// Populates req.userId from the Supabase bearer token when one is present.
app.use("/api", attachUser);

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

    // Chat costs money per call, so it needs an identity to meter against.
    if (!req.userId) {
      return res
        .status(401)
        .json({ error: "Log in to chat with Crewdog.", code: "auth_required" });
    }

    // Admins are exempt; everyone else gets a 5-hour and a weekly allowance.
    const admin = isAdminUser(req.authUser);
    const plan = admin ? "pro" : await planForUser(req.userId);
    if (!admin) {
      const limit = await checkLimit(req.accessToken, plan);
      if (limit && limit.allowed === false) {
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

    const usage = {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      cached_tokens: 0,
    };
    const bumpUsage = (r) => {
      const u = r?.usage ?? {};
      usage.input_tokens += u.input_tokens ?? 0;
      usage.output_tokens += u.output_tokens ?? 0;
      usage.total_tokens += u.total_tokens ?? 0;
      // Cached input bills at 10% of the input rate; it is already included in
      // input_tokens, so it is tracked separately and discounted in toUnits().
      usage.cached_tokens += u.input_tokens_details?.cached_tokens ?? 0;
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

    // Commit what this turn actually cost — chat hops and the job-search
    // pipeline alike, since `usage` accumulates both.
    const committed = admin
      ? null
      : await recordUsage(req.accessToken, plan, usage);

    res.json({
      reply: response.output_text ?? "",
      model: activeModel,
      usage,
      limits: committed ?? undefined,
    });
  } catch (err) {
    console.error("[/api/chat]", err?.message || err);
    res.status(500).json({ error: "Chat request failed" });
  }
});

// ---------------------------------------------------------------------------
// SEO: render the admin-managed metadata into index.html server-side.
//
// The app is a client-rendered SPA, so a crawler that does not run JavaScript
// sees only an empty <div id="root">. Google renders JS eventually; the AI
// crawlers (GPTBot, ClaudeBot, PerplexityBot, …) do not. Rewriting the head
// here means every crawler gets the real title, description and structured
// data in the first response — and the admin can change it without a deploy.
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const SEO_TTL_MS = 60_000;
let seoCache = { value: null, at: 0 };

// get_public_seo() is a SECURITY DEFINER function: the metadata is public by
// definition, so it is readable without a session.
async function fetchSeo() {
  const fresh = Date.now() - seoCache.at < SEO_TTL_MS;
  if (fresh && seoCache.value) return seoCache.value;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return seoCache.value;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_public_seo`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const seo = await res.json();
    seoCache = { value: seo && typeof seo === "object" ? seo : {}, at: Date.now() };
  } catch (err) {
    console.error("[seo] fetch failed, serving last known values:", err?.message || err);
    // Keep serving the previous values (or the static fallback) rather than
    // blanking the head; only back off from retrying on every request.
    seoCache = { ...seoCache, at: Date.now() };
  }
  return seoCache.value;
}

const escapeAttr = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Inline JSON must not be able to close the surrounding <script> tag.
const jsonLd = (obj) =>
  JSON.stringify(obj, null, 2).replace(/</g, "\\u003c");

const metaName = (name, content) =>
  content ? `<meta name="${name}" content="${escapeAttr(content)}" />` : "";

const metaProp = (prop, content) =>
  content ? `<meta property="${prop}" content="${escapeAttr(content)}" />` : "";

function renderSeoBlock(seo) {
  const canonical = seo.canonical || "https://crewdog.app/";
  const image = seo.og_image || "https://crewdog.app/CrewDog-Thumbnail.png";
  const ogTitle = seo.og_title || seo.title;
  const ogDescription = seo.og_description || seo.description;
  const faq = Array.isArray(seo.faq)
    ? seo.faq.filter((f) => f && f.q && f.a)
    : [];

  const parts = [
    seo.title ? `<title>${escapeAttr(seo.title)}</title>` : "",
    metaName("description", seo.description),
    metaName("keywords", seo.keywords),
    metaName("author", "CrewDog"),
    metaName("robots", "index,follow"),
    metaName("language", "en"),
    metaName("distribution", "global"),
    `<link rel="canonical" href="${escapeAttr(canonical)}" />`,

    metaProp("og:locale", "en_GB"),
    metaProp("og:site_name", "CrewDog"),
    metaProp("og:title", ogTitle),
    metaProp("og:description", ogDescription),
    metaProp("og:type", "website"),
    metaProp("og:url", canonical),
    metaProp("og:image", image),
    metaProp("og:image:width", "1200"),
    metaProp("og:image:height", "630"),
    metaProp("og:image:alt", ogTitle),

    metaName("twitter:card", "summary_large_image"),
    metaName("twitter:site", "@crewdog"),
    metaName("twitter:title", seo.twitter_title || ogTitle),
    metaName("twitter:description", seo.twitter_description || ogDescription),
    metaName("twitter:image", image),
    metaName("twitter:image:alt", seo.twitter_title || ogTitle),

    `<script type="application/ld+json">${jsonLd({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "CrewDog",
      url: canonical,
      logo: image,
      description: seo.org_description || seo.description || "",
    })}</script>`,

    `<script type="application/ld+json">${jsonLd({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "CrewDog",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: canonical,
      image,
      description: seo.app_description || seo.description || "",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "GBP",
        description: "Start your first CrewDog search for free.",
      },
    })}</script>`,

    faq.length
      ? `<script type="application/ld+json">${jsonLd({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faq.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        })}</script>`
      : "",
  ];

  return parts.filter(Boolean).join("\n    ");
}

// Serve the built SPA and let client-side routing handle everything else.
const dist = path.join(__dirname, "dist");
const indexPath = path.join(dist, "index.html");
const SEO_BLOCK = /<!-- SEO:START -->[\s\S]*?<!-- SEO:END -->/;

let indexTemplate = null;
function template() {
  // Cached after the first read; dist/ is immutable for the life of a deploy.
  if (indexTemplate === null) indexTemplate = readFileSync(indexPath, "utf8");
  return indexTemplate;
}

// index: false so that "/" falls through to the handler below and gets the
// rendered head rather than the raw file.
app.use(express.static(dist, { index: false }));

app.get("*", async (_req, res) => {
  let html;
  try {
    html = template();
  } catch (err) {
    console.error("[seo] could not read index.html:", err?.message || err);
    return res.status(500).send("Server error");
  }

  try {
    const seo = await fetchSeo();
    // Anything falsy, or a head without the markers, keeps the static fallback.
    if (seo && Object.keys(seo).length && SEO_BLOCK.test(html)) {
      html = html.replace(
        SEO_BLOCK,
        `<!-- SEO:START -->\n    ${renderSeoBlock(seo)}\n    <!-- SEO:END -->`
      );
    }
  } catch (err) {
    console.error("[seo] render failed, serving static head:", err?.message || err);
  }

  res.type("html").send(html);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server listening on ${port}`));
