// Workflow 1 — "Job description" agent pipeline (no n8n, no SerpAPI).
// JD -> extract company/title/location -> verify company -> LinkedIn X-ray
// (HR + connections) using OpenAI's built-in web_search tool.
//
// Searches that start from a title + location instead of a JD are workflow 2,
// "LinkedIn finder" (see linkedinFinder.js).

import { JOB_DESCRIPTION_DEFAULTS as DEFAULTS } from "./agentPrompts.js";

// The five helpers this file used to declare — render, today, outputText,
// addUsage and parseJson — now live one per file under functions/. They were
// never specific to this workflow; all three finders imported them from here,
// which made agent.js look like their parent rather than their sibling.
import { renderTemplate as render } from "./functions/text/renderTemplate.js";
import { today } from "./functions/date/today.js";
import { outputText } from "./functions/openai/outputText.js";
import { addUsage } from "./functions/openai/addUsage.js";
import { parseJsonOrDefault as parseJson } from "./functions/json/parseJsonOrDefault.js";

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
