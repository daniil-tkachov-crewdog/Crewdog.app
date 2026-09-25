// Single Render Web Service: serves the built frontend (dist/) AND the chat API.
// The OpenAI key stays here on the server and never reaches the browser.
import express from "express";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { PDFParse } from "pdf-parse";
import { runJobSearch } from "./agent.js";
import { runLinkedinFinder } from "./linkedinFinder.js";
import { runJobFinder } from "./jobFinder.js";

// Function tools the chat model can call, by name. Each takes
// (openai, args, config, model) and resolves to { result, usage }.
const AGENT_HANDLERS = {
  find_linkedin_connections: runJobSearch,
  find_linkedin_professionals: runLinkedinFinder,
  find_jobs: runJobFinder,
};

// A log-sized record of one workflow run: the criteria the model chose and how
// many people survived each stage. Deliberately counts, not people — the log is
// for diagnosing the pipeline, not for storing anyone's profile.
function summarizeAgentCall(name, args, result) {
  const row = { tool: name };
  if (name === "find_jobs") {
    row.query = String(args?.query ?? "").slice(0, 120);
    row.location = String(args?.location ?? "").slice(0, 120);
    row.key_factors = (Array.isArray(args?.key_factors) ? args.key_factors : [])
      .map((f) => String(f ?? "").slice(0, 80))
      .slice(0, 8);
    row.include_agencies = Boolean(result?.include_agencies);
    row.found = result?.found_count ?? 0;
    row.returned = result?.jobs?.length ?? 0;
  } else if (name === "find_linkedin_professionals") {
    row.job_title = String(args?.job_title ?? "").slice(0, 120);
    row.location = String(args?.location ?? "").slice(0, 120);
    row.key_factors = (Array.isArray(args?.key_factors) ? args.key_factors : [])
      .map((f) => String(f ?? "").slice(0, 80))
      .slice(0, 8);
    row.routes = Array.isArray(result?.routes) ? result.routes : [];
    row.checked = result?.checked_count ?? 0;
    row.returned = (result?.available?.length ?? 0) + (result?.others?.length ?? 0);
    row.available = result?.available?.length ?? 0;
    row.near_misses = result?.near_misses?.length ?? 0;
  } else {
    row.had_job_description = Boolean(String(args?.job_description ?? "").trim());
    row.company = String(result?.extracted?.company ?? "").slice(0, 120);
    row.location = String(result?.extracted?.location ?? "").slice(0, 120);
    row.returned = result?.contacts?.length ?? 0;
  }
  if (result?.error) row.error = String(result.error).slice(0, 120);
  return row;
}
import {
  attachUser,
  isAdminUser,
  planForUser,
  checkLimit,
  recordUsage,
} from "./usage.js";
import { recordPageView } from "./traffic.js";
import { recordChatCall } from "./chatlog.js";
import { isBlockedPath } from "./blocklist.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// Render puts a proxy in front of us, so the client address lives in
// x-forwarded-for rather than on the socket. Without this req.ip is the proxy.
app.set("trust proxy", true);
// Vulnerability scanners (/.git/HEAD, /.env, /wp-login.php, …) get a bare 404
// before they reach body parsing, static files or the SPA handler. The view is
// still logged, so these probes stay visible in the admin traffic tab. Search
// and AI crawlers never request these paths, so indexing is unaffected.
app.use((req, res, next) => {
  if (!isBlockedPath(req.path)) return next();
  recordPageView(req, { path: req.path, referrer: req.headers.referer });
  res.status(404).type("text/plain").send("Not found");
});
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

// POST /api/track — one page view from the SPA.
//
// The catch-all below only sees the initial document request, so every
// client-side route change after that would be invisible without this. The body
// carries the path and referrer only: the IP, user agent and geo are read from
// the request itself, so a caller cannot forge where a visit came from. Answers
// 204 immediately and logs in the background — sendBeacon ignores the response
// and a tracking failure must never surface to the visitor.
app.post("/api/track", (req, res) => {
  res.status(204).end();
  recordPageView(req, {
    path: req.body?.path,
    referrer: req.body?.referrer,
    userId: req.userId,
  });
});

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
  // Every exit from this handler is logged server-side (see chatlog.js), so a
  // turn that spends OpenAI credit always leaves a row, whatever it answers.
  const startedAt = Date.now();
  const usage = {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    cached_tokens: 0,
    requests: 0,
  };
  let loggedModel = null;
  let loggedAgent = false;
  // What the model actually asked each workflow for, and what came back. Without
  // this a disappointing answer is unattributable: you cannot tell a criterion
  // the model silently dropped from one the search genuinely could not fill.
  const agentCalls = [];
  const log = (status, error) =>
    recordChatCall(req, {
      model: loggedModel,
      agent: loggedAgent,
      agentCalls,
      usage,
      status,
      startedAt,
      error,
    });

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
      log(400);
      return res.status(400).json({ error: "messages[] is required" });
    }

    // Chat costs money per call, so it needs an identity to meter against.
    if (!req.userId) {
      log(401);
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
      log(429);
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
    const agentEnabled = !!agent?.enabled;
    const finderEnabled = !!agent?.linkedin_finder_enabled;
    const jobFinderEnabled = !!agent?.job_finder_enabled;
    loggedModel = activeModel;
    loggedAgent = agentEnabled || finderEnabled || jobFinderEnabled;

    const tools = [];
    if (webSearch) tools.push({ type: "web_search" });
    if (fileSearch) tools.push({ type: "file_search" });
    if (agentEnabled) {
      tools.push({
        type: "function",
        name: "find_linkedin_connections",
        description:
          "Find the HR/recruiter contacts and potential connections behind a specific job opening. Call this ONLY when the user has pasted an actual job description. If the user just asks to find people by title and location with no job description, use find_linkedin_professionals instead.",
        parameters: {
          type: "object",
          properties: {
            job_description: {
              type: "string",
              description: "The full job description text the user pasted. Required — this tool does nothing without it.",
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
        description:
          "Search LinkedIn for professionals matching a job title and location, verify each match, and return their profile links. Call this whenever the user asks to find people/professionals/candidates WITHOUT pasting a job description (e.g. 'find me senior nurses in Manchester'). Both job_title and location are required: if the user has not given one of them, ask them for it in your reply instead of calling this tool with a guess. Put EVERY further qualifier the user mentioned into key_factors — availability ('available to work', 'open to work', 'actively looking', 'free to start'), company, seniority, industry, skills, certifications, language, current vs past employer. Never drop a qualifier because it seems vague or hard to search for: the pipeline knows how to look for these and how to report the ones it could not confirm. It always returns people who are advertising that they are available alongside ordinary matches, so asking for availability sorts and labels the list rather than narrowing it.",
        parameters: {
          type: "object",
          properties: {
            job_title: {
              type: "string",
              description: "The job title to search for, e.g. 'backend engineer'. Required.",
            },
            location: {
              type: "string",
              description: "The city, region or country to search in, e.g. 'Berlin'. Required.",
            },
            key_factors: {
              type: "array",
              items: { type: "string" },
              description:
                "Any extra criteria the user gave, one per entry, e.g. ['Zalando', 'senior', 'fintech']. Empty when they gave none.",
            },
          },
          required: ["job_title", "location", "key_factors"],
          additionalProperties: false,
        },
      });
    }
    if (jobFinderEnabled) {
      tools.push({
        type: "function",
        name: "find_jobs",
        description:
          "Search the web for currently open data centre job vacancies and return them with title, location, salary and a link to the advert. Call this whenever the user is looking for work FOR THEMSELVES — 'find me a job', 'any data centre jobs in Dublin?', 'what critical facilities roles are open?', 'I'm a shift technician looking for something new'. This is the opposite of the other two tools: find_linkedin_connections and find_linkedin_professionals find PEOPLE, this one finds VACANCIES. The scope is the data centre industry in any form (colocation, hyperscale, critical facilities, MEP, commissioning, cooling, power, DCIM, construction and fit-out, NOC and security, DC sales and design); if the user asks for work outside that sector, tell them Crewdog covers data centres rather than calling this tool. Only query is required — put the kind of role they want in it, and call the tool without a location when they have not named one instead of guessing a city.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                "What the user is looking for, in their terms, e.g. 'data centre shift technician' or 'mission critical commissioning manager'. Required.",
            },
            location: {
              type: "string",
              description:
                "The city, region or country they want to work in, e.g. 'Dublin'. Empty string when they did not say — do not guess one.",
            },
            key_factors: {
              type: "array",
              items: { type: "string" },
              description:
                "Any further requirements they gave, one per entry, e.g. ['contract', 'nights', 'HV authorised', 'remote']. Empty when they gave none.",
            },
          },
          required: ["query", "location", "key_factors"],
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

    const bumpUsage = (r) => {
      const u = r?.usage ?? {};
      usage.requests += 1;
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
        (o) => o.type === "function_call" && AGENT_HANDLERS[o.name]
      );
      if (!calls.length) break;

      const toolOutputs = [];
      for (const call of calls) {
        let out;
        try {
          const args = JSON.parse(call.arguments || "{}");
          const { result, usage: pu } = await AGENT_HANDLERS[call.name](
            openai,
            args,
            agent?.config ?? {},
            activeModel
          );
          usage.input_tokens += pu.input_tokens;
          usage.output_tokens += pu.output_tokens;
          usage.total_tokens += pu.total_tokens;
          usage.requests += pu.requests ?? 0;
          agentCalls.push(summarizeAgentCall(call.name, args, result));
          out = JSON.stringify(result);
        } catch (e) {
          agentCalls.push({ tool: call.name, error: String(e?.message || e).slice(0, 300) });
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
    const committed = await recordUsage(req.accessToken, plan, usage);

    log(200);
    res.json({
      reply: response.output_text ?? "",
      model: activeModel,
      usage,
      limits: committed ?? undefined,
    });
  } catch (err) {
    console.error("[/api/chat]", err?.message || err);
    // Tokens already spent before the throw still belong in the log.
    log(500, err?.message || err);
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

app.get("*", async (req, res) => {
  // The one funnel every real page load passes through: static assets are
  // served above, so anything reaching here is a document request. Logged
  // fire-and-forget so a tracking outage cannot stop the page rendering.
  // Subsequent in-app navigations arrive via POST /api/track instead.
  recordPageView(req, { path: req.path, referrer: req.headers.referer });

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
