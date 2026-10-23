// Single Render Web Service: serves the built frontend (dist/) AND the chat API.
// The OpenAI key stays here on the server and never reaches the browser.
import express from "express";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import OpenAI, { toFile } from "openai";
import {
  CvReaderError,
  decodePdf,
  extractCvFields,
  pdfToText,
  storeCv,
} from "./cvReader.js";
import { runJobSearch } from "./agent.js";
import { runLinkedinFinder, normalizeUrl } from "./linkedinFinder.js";
import { lookupContact } from "./lusha.js";
import {
  lushaEnabled,
  readCachedLookup,
  writeCachedLookup,
} from "./contactLookups.js";
import { runJobFinder } from "./jobFinder.js";
import { runAccommodationFinder } from "./accommodationFinder.js";
import {
  toCardGroup,
  fromProJson,
  CARDS_PRESENTATION,
  SUGGESTIONS_CONTRACT,
  SUGGESTIONS_TAIL,
  WORKFLOW_CONTRACT,
  splitSuggestions,
} from "./chatResults.js";
import { PRO_SCHEMA_DEFAULT, PRO_SCHEMA_DEFAULT_TEXT } from "./proSchema.js";
import {
  listSkills,
  getSkillPrompts,
  renderSkillMenu,
  SkillsUnavailableError,
} from "./proSkills.js";

// Function tools the chat model can call, by name. Each takes
// (openai, args, config, model) and resolves to { result, usage }.
const AGENT_HANDLERS = {
  find_linkedin_connections: runJobSearch,
  find_linkedin_professionals: runLinkedinFinder,
  find_jobs: runJobFinder,
  find_accommodation: runAccommodationFinder,
};

// The conversation as the Responses API wants it. Both chat paths send the same
// history; only what rides alongside it differs.
function toModelInput(messages) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content ?? ""),
  }));
}

// Pro mode's `text.format`, built from the schema saved in the admin panel.
//
// A bad paste in the panel must not take Pro mode down, so an unparseable or
// structurally wrong schema falls back to the built-in default — the same
// fail-safe the tool-argument prompts use. Returning something always is the
// point: without a format, Pro mode would answer in prose and render no cards.
function proFormat(raw) {
  for (const src of [raw, PRO_SCHEMA_DEFAULT]) {
    try {
      const parsed = typeof src === "string" ? JSON.parse(src) : src;
      if (parsed?.schema?.type !== "object") continue;
      // The API only accepts [a-zA-Z0-9_-] here, and the name is a label, so a
      // sanitised one is better than a 400 on an otherwise valid schema.
      const name =
        String(parsed.name ?? "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) ||
        "crewdog_pro_search";
      return {
        type: "json_schema",
        name,
        strict: parsed.strict !== false,
        schema: parsed.schema,
      };
    } catch {
      /* try the default next */
    }
  }
}

// A log-sized record of one workflow run: the criteria the model chose and how
// many people survived each stage. Deliberately counts, not people — the log is
// for diagnosing the pipeline, not for storing anyone's profile.
function summarizeAgentCall(name, args, result) {
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
import {
  attachUser,
  isAdminUser,
  planForUser,
  checkLimit,
  recordUsage,
} from "./usage.js";
import { recordPageView } from "./traffic.js";
import { recordChatCall } from "./chatlog.js";
import { ROUTING_DEFAULTS, TOOL_PARAM_DEFAULTS } from "./agentPrompts.js";
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
// Speech-to-text for the composer's microphone button. Same API key as the
// chat; overridable without a deploy if a cheaper model is wanted.
const TRANSCRIBE_MODEL =
  process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe";
// MediaRecorder's container varies by browser, and OpenAI reads the format
// from the filename, so the mime type has to be mapped back to an extension.
const AUDIO_EXTENSIONS = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

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

// GET /api/pro-schema — the built-in Pro output schema, so the admin panel's
// "Reset to default" button has one source of truth to read rather than a
// second copy of the schema living in the frontend bundle.
app.get("/api/pro-schema", (_req, res) => {
  res.type("application/json").send(PRO_SCHEMA_DEFAULT_TEXT);
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

    // Decoding, the size guard and the PDF read all live in cvReader.js, which
    // /api/cv-reader below shares with this route.
    const buf = decodePdf(dataBase64);
    const text = await pdfToText(buf);

    res.json({ text, filename: filename || "CV.pdf", chars: text.length });
  } catch (err) {
    if (err instanceof CvReaderError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error("[/api/extract-cv]", err?.message || err);
    res.status(500).json({ error: "Could not read the PDF." });
  }
});

// POST /api/cv-reader  { dataBase64, filename? }
// cv_reader: the account page's CV upload. Reads the PDF, asks the model who
// this is, stores the file in the private `cvs` bucket and saves the details to
// the caller's profile. Returns { cv, profile }.
//
// This is the same PDF the composer's attach button reads, but a different job:
// the composer wants text for one prompt and keeps nothing, while this keeps the
// document and the profile it fills. Hence a second route rather than a flag.
app.post("/api/cv-reader", async (req, res) => {
  try {
    // A CV is personal data stored under an account, and the parse costs money,
    // so this needs an identity behind it exactly like /api/transcribe. The
    // storage object and both rows are written as the caller, so the token is
    // also what the RLS policies check.
    if (!req.userId) {
      return res
        .status(401)
        .json({ error: "Log in to upload your CV.", code: "auth_required" });
    }
    const { dataBase64, filename } = req.body ?? {};
    if (typeof dataBase64 !== "string" || !dataBase64) {
      return res.status(400).json({ error: "dataBase64 is required" });
    }

    const buf = decodePdf(dataBase64);
    const text = await pdfToText(buf);
    const fields = await extractCvFields(openai, text);
    const { cv, profile } = await storeCv({
      accessToken: req.accessToken,
      userId: req.userId,
      buffer: buf,
      filename: filename || "CV.pdf",
      fields,
    });

    console.log(
      `[cv-reader] user=${req.userId} file=${cv.file_name} chars=${text.length}`
    );
    res.json({ cv, profile });
  } catch (err) {
    if (err instanceof CvReaderError) {
      console.error("[cv-reader]", err.message);
      return res.status(err.status).json({ error: err.message });
    }
    console.error("[cv-reader]", err?.message || err);
    res.status(500).json({ error: "Could not read your CV." });
  }
});

// POST /api/transcribe  { audioBase64, mimeType? }
// Turns a composer recording into text so the frontend can send it as an
// ordinary chat message. Returns { text }.
//
// The browser hands over whatever container MediaRecorder gave it (webm/opus on
// Chrome and Firefox, mp4/aac on Safari), base64-encoded through the existing
// JSON body parser rather than as multipart — the same route the CV upload
// takes, so no new middleware is involved.
app.post("/api/transcribe", async (req, res) => {
  try {
    // Transcription costs money per call, so it needs an identity behind it,
    // exactly like /api/chat. The usage meter counts chat tokens only, so this
    // gate is the whole of the cost control here.
    if (!req.userId) {
      return res
        .status(401)
        .json({ error: "Log in to use voice input.", code: "auth_required" });
    }

    const { audioBase64, mimeType } = req.body ?? {};
    if (typeof audioBase64 !== "string" || !audioBase64) {
      return res.status(400).json({ error: "audioBase64 is required" });
    }

    // Strip an optional data: URL prefix (e.g. "data:audio/webm;base64,").
    const b64 = audioBase64.includes(",")
      ? audioBase64.split(",").pop()
      : audioBase64;
    let buf;
    try {
      buf = Buffer.from(b64, "base64");
    } catch {
      return res.status(400).json({ error: "Invalid base64 data" });
    }
    if (!buf.length) return res.status(400).json({ error: "Empty recording" });
    // 10 MB of audio is minutes of speech; the JSON body cap is 15 MB and
    // base64 inflates by a third, so this is the real ceiling either way.
    if (buf.length > 10 * 1024 * 1024) {
      return res.status(413).json({ error: "Recording too long (max 10MB)" });
    }

    // OpenAI picks the decoder from the filename extension, so the container
    // the browser recorded in has to survive the trip.
    const type = String(mimeType || "").split(";")[0].trim().toLowerCase();
    const ext = AUDIO_EXTENSIONS[type] || "webm";
    const file = await toFile(buf, `voice.${ext}`, {
      type: type || "audio/webm",
    });

    const result = await openai.audio.transcriptions.create({
      file,
      model: TRANSCRIBE_MODEL,
    });
    const text = String(result?.text ?? "").trim();
    // Silence and background noise both come back empty. Saying so is better
    // than sending an empty prompt to the chat model.
    if (!text) {
      return res.status(422).json({ error: "Didn't catch any speech." });
    }
    res.json({ text, model: TRANSCRIBE_MODEL });
  } catch (err) {
    console.error("[/api/transcribe]", err?.message || err);
    res.status(500).json({ error: "Could not transcribe the recording." });
  }
});

// POST /api/contact-lookup  { linkedinUrl, field: "phone" | "email" }
// Reveals one contact datapoint for one LinkedIn profile via Lusha.
//
// This is the only paid third-party call in the app that a user triggers
// directly, and Lusha bills per revealed datapoint, so every guard here is a
// cost guard. In order, cheapest first: signed in, well-formed profile URL,
// switched on in the admin, not already bought. Lusha is reached only after all
// four pass.
app.post("/api/contact-lookup", async (req, res) => {
  try {
    // Signed-in only. The buttons are per-card, so an anonymous visitor running
    // one search could otherwise spend the whole credit balance in a minute.
    if (!req.userId) {
      return res.status(401).json({ status: "error", message: "Please sign in first." });
    }

    const { linkedinUrl, field } = req.body ?? {};
    if (field !== "phone" && field !== "email") {
      return res.status(400).json({ status: "error", message: "Unknown field." });
    }

    // normalizeUrl returns "" for anything that is not linkedin.com/in/<slug>,
    // which keeps an arbitrary URL from becoming a billable Lusha call, and
    // collapses the same person's variant URLs onto one cache row.
    const url = normalizeUrl(linkedinUrl);
    if (!url) {
      return res
        .status(400)
        .json({ status: "error", message: "Not a LinkedIn profile URL." });
    }

    if (!(await lushaEnabled())) {
      return res
        .status(403)
        .json({ status: "disabled", message: "Contact lookup is switched off." });
    }

    const cached = await readCachedLookup(url, field);
    if (cached) {
      const values = field === "email" ? cached.emails : cached.phones;
      return res.json(
        values.length
          ? { status: "success", ...cached, cached: true }
          : { status: "not_found", cached: true }
      );
    }

    const result = await lookupContact({ linkedinUrl: url, field });

    // Cache both a hit and a confirmed miss, but never an error: a timeout is
    // not evidence that Lusha has nothing, and storing it would permanently
    // hide a contact we never actually asked about.
    if (result.status === "success" || result.status === "not_found") {
      await writeCachedLookup(url, field, {
        phones: result.phones ?? [],
        emails: result.emails ?? [],
      });
    }

    console.log(
      `[contacts] user=${req.userId} field=${field} url=${url} -> ${result.status}`
    );
    res.status(result.status === "disabled" ? 503 : 200).json(result);
  } catch (err) {
    console.error("[/api/contact-lookup]", err?.message || err);
    res
      .status(500)
      .json({ status: "error", message: "Contact lookup is unavailable right now." });
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
  let loggedMode = null;
  // What the model actually asked each workflow for, and what came back. Without
  // this a disappointing answer is unattributable: you cannot tell a criterion
  // the model silently dropped from one the search genuinely could not fill.
  const agentCalls = [];
  // Workflow results the chat page renders as cards beside the reply text.
  const results = [];
  const log = (status, error) =>
    recordChatCall(req, {
      model: loggedModel,
      agent: loggedAgent,
      agentCalls,
      usage,
      status,
      startedAt,
      error,
      mode: loggedMode,
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
      mode,
      jsonSchema,
      loadedSkills: clientLoadedSkills,
    } = req.body ?? {};
    // Set before the gates below, so a turn refused for auth or a spent limit
    // still records which mode the user was trying to use.
    loggedMode = mode === "pro" ? "pro" : "normal";
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
    const isPro = mode === "pro";

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

    // ---- Pro mode -----------------------------------------------------------
    //
    // No sub-agents: the model searches the web itself and writes the cards
    // itself, under the strict JSON schema. What it does NOT carry is the
    // detail of how to run each kind of search — that lives in the skills
    // table and arrives through load_skill, so a "hello" costs a few hundred
    // characters of context instead of thirty thousand.
    //
    // Pro answers over SSE rather than a single JSON body, purely so the skill
    // loading is visible while it happens. The final `done` event carries the
    // exact payload Normal mode returns, so nothing downstream changes.
    if (isPro) {
      loggedModel = activeModel;

      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
      const fail = (status, code, message, error) => {
        log(status, error ?? message);
        send({ type: "error", code, error: message });
        res.end();
      };

      let menu;
      try {
        menu = await listSkills(req.accessToken);
      } catch (err) {
        // Without the menu the model does not know a skill exists, so it would
        // answer from the core prompt alone and quietly produce nothing. Stop.
        return fail(503, "skills_unavailable",
          "Crewdog can't reach its skills right now. Try again in a moment.",
          err?.message || err);
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
          return fail(503, "skills_unavailable",
            "Crewdog can't reach its skills right now. Try again in a moment.",
            err?.message || err);
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
      const format = proFormat(jsonSchema);

      let response = await openai.responses.create({
        model: activeModel,
        instructions: buildInstructions(bodies),
        input: toModelInput(messages),
        tools: proTools.length ? proTools : undefined,
        text: { format },
      });
      bumpUsage(response);

      // Same three hops Normal mode gets. One is enough for load-then-answer;
      // the rest cover a model that realises mid-turn it needs another skill.
      for (let hop = 0; hop < 3; hop++) {
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

          for (const slug of fresh) send({ type: "status", text: `Loading ${nameOf(slug)}…` });

          let fetched = [];
          if (fresh.length) {
            try {
              fetched = await getSkillPrompts(req.accessToken, fresh);
            } catch (err) {
              // Three attempts already failed inside getSkillPrompts. The model
              // asked for instructions it cannot have, so the honest end to the
              // turn is to say so rather than let it improvise.
              return fail(503, "skills_unavailable",
                "Crewdog can't reach its skills right now. Try again in a moment.",
                err?.message || err);
            }
          }

          for (const b of fetched) {
            if (!loaded.includes(b.slug)) loaded.push(b.slug);
            bodies.push(b);
            send({ type: "status", text: `${b.name} loaded` });
          }
          agentCalls.push({ tool: "load_skill", skills: fetched.map((b) => b.slug) });

          toolOutputs.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: fetched.length
              ? fetched
                  .map((b) => `SKILL — ${b.name}\n\n${b.prompt}`)
                  .join("\n\n---\n\n")
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
        bumpUsage(response);
      }

      loggedAgent = loaded.length > 0;
      const committed = await recordUsage(req.accessToken, plan, usage);
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
        log(502, "pro: output was not parseable JSON");
        send({
          type: "done",
          reply: raw,
          suggestions: [],
          results: [],
          loadedSkills: loaded,
          model: activeModel,
          usage,
          limits: committed ?? undefined,
        });
        return res.end();
      }

      // Cards are built from rules that live in the skills. If the model never
      // loaded one and produced results anyway, it invented the shape from the
      // core prompt — drop them, so a missed skill shows up as a missing card
      // rather than a plausible wrong one.
      const results = loaded.length ? payload.results : [];
      if (!loaded.length && payload.results.length) {
        console.warn("[pro] dropped results built with no skill loaded");
      }

      log(200);
      send({
        type: "done",
        reply: payload.reply,
        suggestions: payload.suggestions,
        results,
        loadedSkills: loaded,
        model: activeModel,
        usage,
        limits: committed ?? undefined,
      });
      return res.end();
    }

    const agentEnabled = !!agent?.enabled;
    const finderEnabled = !!agent?.linkedin_finder_enabled;
    const jobFinderEnabled = !!agent?.job_finder_enabled;
    const accomFinderEnabled = !!agent?.accommodation_finder_enabled;
    const anyFinderEnabled =
      agentEnabled || finderEnabled || jobFinderEnabled || accomFinderEnabled;
    loggedModel = activeModel;
    loggedAgent = anyFinderEnabled;

    // Tool descriptions are prompts too — the model reads them to decide which
    // workflow a message belongs to — so they come from the admin config.
    const routing = { ...ROUTING_DEFAULTS, ...(agent?.config ?? {}) };
    const toolDesc = (k) => String(routing[k] ?? "").trim() || ROUTING_DEFAULTS[k];
    // Argument descriptions come as one JSON blob per tool. Unparseable edits
    // fall back to the defaults: a bad paste in the panel must not take the
    // workflow down with it.
    const toolParam = (k, field) => {
      for (const src of [routing[k], TOOL_PARAM_DEFAULTS[k]]) {
        try {
          const v = JSON.parse(String(src ?? ""))?.[field];
          if (typeof v === "string" && v.trim()) return v;
        } catch {
          /* try the default next */
        }
      }
      return "";
    };

    const tools = [];
    if (webSearch) tools.push({ type: "web_search" });
    if (fileSearch) tools.push({ type: "file_search" });
    if (agentEnabled) {
      tools.push({
        type: "function",
        name: "find_linkedin_connections",
        description: toolDesc("tool_find_linkedin_connections"),
        parameters: {
          type: "object",
          properties: {
            job_description: {
              type: "string",
              description: toolParam("tool_params_find_linkedin_connections", "job_description"),
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
        description: toolDesc("tool_find_linkedin_professionals"),
        parameters: {
          type: "object",
          properties: {
            request: {
              type: "string",
              description: toolParam("tool_params_find_linkedin_professionals", "request"),
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
        description: toolDesc("tool_find_jobs"),
        parameters: {
          type: "object",
          properties: {
            request: {
              type: "string",
              description: toolParam("tool_params_find_jobs", "request"),
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
        description: toolDesc("tool_find_accommodation"),
        parameters: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: toolParam("tool_params_find_accommodation", "location"),
            },
            place_type: {
              type: "string",
              description: toolParam("tool_params_find_accommodation", "place_type"),
            },
            budget: {
              type: "string",
              description: toolParam("tool_params_find_accommodation", "budget"),
            },
            move_in_date: {
              type: "string",
              description: toolParam("tool_params_find_accommodation", "move_in_date"),
            },
            requirements: {
              type: "array",
              items: { type: "string" },
              description: toolParam("tool_params_find_accommodation", "requirements"),
            },
          },
          required: ["location", "place_type", "budget", "move_in_date", "requirements"],
          additionalProperties: false,
        },
      });
    }

    const baseInstructions =
      (typeof sysOverride === "string" && sysOverride.trim()) ||
      systemPrompt() ||
      "";
    // Two contracts between the model and the app — results arrive as cards, and
    // the next steps are buttons rather than a question in the prose. Both are
    // appended to whatever system prompt the admin has set rather than living in
    // the editable text, so neither can be edited away.
    const workflowContract =
      String(routing.chat_workflow_contract ?? "").trim() || WORKFLOW_CONTRACT;
    const suggestionsContract =
      String(routing.chat_suggestions_contract ?? "").trim() || SUGGESTIONS_CONTRACT;
    const instructions = anyFinderEnabled
      ? `${baseInstructions}\n\n${workflowContract}\n\n${suggestionsContract}`.trim()
      : `${baseInstructions}\n\n${suggestionsContract}`.trim();
    const addition = typeof userPromptAddition === "string" ? userPromptAddition.trim() : "";

    const input = toModelInput(messages);
    // Attach the hidden instruction to the latest user message (invisible to the user).
    if (addition) {
      for (let i = input.length - 1; i >= 0; i--) {
        if (input[i].role === "user") {
          input[i] = { ...input[i], content: `${input[i].content}\n\n${addition}` };
          break;
        }
      }
    }

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
            activeModel,
            // The LinkedIn and job finders are one prompt re-injected per
            // message, so they need the same conversation the chat model has.
            { history: input }
          );
          usage.input_tokens += pu.input_tokens;
          usage.output_tokens += pu.output_tokens;
          usage.total_tokens += pu.total_tokens;
          usage.requests += pu.requests ?? 0;
          agentCalls.push(summarizeAgentCall(call.name, args, result));
          // Shown as cards, the list must not be printed again in the text.
          const group = toCardGroup(call.name, args, result);
          if (group) results.push(group);
          // Whatever tells the model how to present this result is also what
          // tells it to stop writing, so the suggestions exemption is pinned to
          // the end of it rather than left in the system prompt to be overruled.
          const cardsPresentation =
            String(routing.chat_cards_presentation ?? "").trim() || CARDS_PRESENTATION;
          const suggestionsTail =
            String(routing.chat_suggestions_tail ?? "").trim() || SUGGESTIONS_TAIL;
          const presentation = `${
            group ? cardsPresentation : result?.presentation ?? ""
          }\n\n${suggestionsTail}`.trim();
          out = JSON.stringify({ ...result, presentation });
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

      // `instructions` is NOT inherited through previous_response_id — the API
      // drops it so a caller can swap the system message per turn. Omitting it
      // here ran every tool-using reply, which is the reply the user actually
      // reads, with no system prompt at all: no industry scope, no presentation
      // rules, no suggested next steps. It has to be resent on every hop.
      response = await openai.responses.create({
        model: activeModel,
        instructions,
        previous_response_id: response.id,
        input: toolOutputs,
        tools: tools.length ? tools : undefined,
      });
      bumpUsage(response);
    }

    // Commit what this turn actually cost — chat hops and the job-search
    // pipeline alike, since `usage` accumulates both.
    const committed = await recordUsage(req.accessToken, plan, usage);

    // The suggestions ride back in the reply text; split them out so the page
    // gets buttons and the stored message stays clean prose.
    const { text: replyText, suggestions } = splitSuggestions(
      response.output_text ?? ""
    );

    log(200);
    res.json({
      reply: replyText,
      suggestions,
      results,
      model: activeModel,
      usage,
      limits: committed ?? undefined,
    });
  } catch (err) {
    console.error("[/api/chat]", err?.message || err);
    // Tokens already spent before the throw still belong in the log.
    log(500, err?.message || err);
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
