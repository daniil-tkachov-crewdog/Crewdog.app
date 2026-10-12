// Workflow 1 — "Job description" agent pipeline (no n8n, no SerpAPI).
// JD -> extract company/title/location -> verify company -> LinkedIn X-ray
// (HR + connections) using OpenAI's built-in web_search tool.
//
// Searches that start from a title + location instead of a JD are workflow 2,
// "LinkedIn finder" (see linkedinFinder.js).

import { JOB_DESCRIPTION_DEFAULTS as DEFAULTS } from "./agentPrompts.js";

// Fill {{placeholders}} in an admin-edited prompt from the values the run
// actually has. Every prompt the app sends is editable in the admin panel, and
// the ones that carry a search's own criteria into the model need somewhere to
// put them — this is that seam.
//
// An unknown placeholder is left exactly as written rather than blanked, so a
// typo shows up in the prompt instead of silently deleting a line.
export function render(template, vars = {}) {
  return String(template ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key) =>
    key in vars ? String(vars[key] ?? "") : whole
  );
}

// Today, as the prompts want to quote it. Every run gets it as a placeholder.
export const today = () => new Date().toISOString().slice(0, 10);

// Pull the assistant text out of a Responses API result.
export function outputText(resp) {
  return resp?.output_text ?? "";
}

// Sum token usage from a Responses API result into an accumulator. `requests`
// counts the OpenAI calls themselves, so a turn can be reconciled against the
// request count on the OpenAI dashboard.
export function addUsage(acc, resp) {
  const u = resp?.usage ?? {};
  acc.input_tokens += u.input_tokens ?? 0;
  acc.output_tokens += u.output_tokens ?? 0;
  acc.total_tokens += u.total_tokens ?? 0;
  acc.requests += 1;
}

// Best-effort JSON parse (strips code fences / surrounding prose).
export function parseJson(text, fallback) {
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* ignore */
      }
    }
    return fallback;
  }
}

export async function runJobSearch(openai, args = {}, cfg = {}, model = "gpt-4o") {
  const c = { ...DEFAULTS, ...cfg };
  const usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0, requests: 0 };

  // `args` may be a raw JD string (legacy) or an object with optional fields.
  const a = typeof args === "string" ? { job_description: args } : args ?? {};
  const jobDescription = String(a.job_description ?? "").slice(0, 12000);

  // This workflow is job-description-only. Searches without a JD belong to the
  // LinkedIn finder workflow (linkedinFinder.js), so bail out and let the model
  // re-route rather than silently running a weaker search.
  if (!jobDescription.trim()) {
    return {
      result: {
        error: "no_job_description",
        note: "This workflow needs a job description. For a title/location search, call find_linkedin_professionals instead.",
      },
      usage,
    };
  }

  // 1) Extract company / title / location from the job description.
  const extractResp = await openai.responses.create({
    model,
    instructions: c.extract_instructions,
    input: render(c.extract_input || DEFAULTS.extract_input, {
      job_description: jobDescription,
    }),
  });
  addUsage(usage, extractResp);
  const extracted = parseJson(outputText(extractResp), {
    company: "",
    company_simplified: "",
    title: "",
    location: "",
  });

  // 2) Verify the company (web search) — only when a company is known.
  let verification = {
    exists: null,
    canonical_name: extracted.company,
    domain: "",
    note: extracted.company ? "" : "No company specified; verification skipped.",
  };
  if ((extracted.company || extracted.company_simplified).trim()) {
    const verifyResp = await openai.responses.create({
      model,
      instructions: c.verify_instructions,
      tools: [{ type: "web_search" }],
      input: render(c.verify_input || DEFAULTS.verify_input, {
        company: extracted.company || extracted.company_simplified,
        location: extracted.location,
      }),
    });
    addUsage(usage, verifyResp);
    verification = parseJson(outputText(verifyResp), verification);
  }

  const companyForSearch =
    verification.canonical_name || extracted.company || extracted.company_simplified;

  // 3) LinkedIn X-ray search for HR + potential connections (web search).
  const searchResp = await openai.responses.create({
    model,
    instructions: c.search_instructions,
    tools: [{ type: "web_search" }],
    input: render(c.search_input || DEFAULTS.search_input, {
      max_contacts: c.max_contacts,
      hr_roles: c.hr_roles,
      company: companyForSearch,
      title: extracted.title,
      location: extracted.location,
    }),
  });
  addUsage(usage, searchResp);
  const searchOut = parseJson(outputText(searchResp), { contacts: [] });
  const contacts = Array.isArray(searchOut.contacts)
    ? searchOut.contacts.slice(0, c.max_contacts)
    : [];

  return {
    result: { extracted, verification, contacts },
    usage,
  };
}
