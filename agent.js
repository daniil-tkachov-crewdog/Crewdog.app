// Job-search agent pipeline (no n8n, no SerpAPI).
// JD -> extract company/title/location -> verify company -> LinkedIn X-ray
// (HR + connections) using OpenAI's built-in web_search tool.

const DEFAULTS = {
  max_contacts: 8,
  hr_roles:
    '"human resources", "recruiter", "talent acquisition", "hiring manager", "people team", "HR"',
  extract_instructions:
    "You extract structured data from a job description. Return the hiring company, simplified company variants, the job title, and the job location.",
  verify_instructions:
    "You verify that a company is real using web search. Return whether it exists, its canonical name, and its primary website domain.",
  search_instructions:
    "You find real LinkedIn member profiles via web search using Google X-ray queries of the form: site:linkedin.com/in/ AND (role terms) AND (company) AND (location). Return only genuine linkedin.com/in/ profile URLs.",
};

// Pull the assistant text out of a Responses API result.
function outputText(resp) {
  return resp?.output_text ?? "";
}

// Sum token usage from a Responses API result into an accumulator.
function addUsage(acc, resp) {
  const u = resp?.usage ?? {};
  acc.input_tokens += u.input_tokens ?? 0;
  acc.output_tokens += u.output_tokens ?? 0;
  acc.total_tokens += u.total_tokens ?? 0;
}

// Best-effort JSON parse (strips code fences / surrounding prose).
function parseJson(text, fallback) {
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

export async function runJobSearch(openai, jd, cfg = {}, model = "gpt-4o") {
  const c = { ...DEFAULTS, ...cfg };
  const usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
  const jobDescription = String(jd ?? "").slice(0, 12000);

  // 1) Extract company / title / location.
  const extractResp = await openai.responses.create({
    model,
    instructions: c.extract_instructions,
    input: `Job description:\n${jobDescription}\n\nReturn ONLY JSON: {"company": string, "company_simplified": string, "title": string, "location": string}`,
  });
  addUsage(usage, extractResp);
  const extracted = parseJson(outputText(extractResp), {
    company: "",
    company_simplified: "",
    title: "",
    location: "",
  });

  // 2) Verify the company (web search).
  const verifyResp = await openai.responses.create({
    model,
    instructions: c.verify_instructions,
    tools: [{ type: "web_search" }],
    input: `Company: ${extracted.company || extracted.company_simplified}\nLocation: ${extracted.location}\n\nReturn ONLY JSON: {"exists": boolean, "canonical_name": string, "domain": string, "note": string}`,
  });
  addUsage(usage, verifyResp);
  const verification = parseJson(outputText(verifyResp), {
    exists: null,
    canonical_name: extracted.company,
    domain: "",
    note: "",
  });

  const companyForSearch =
    verification.canonical_name || extracted.company || extracted.company_simplified;

  // 3) LinkedIn X-ray search for HR + potential connections (web search).
  const searchResp = await openai.responses.create({
    model,
    instructions: c.search_instructions,
    tools: [{ type: "web_search" }],
    input:
      `Find up to ${c.max_contacts} real LinkedIn profiles (linkedin.com/in/) of people who could help with an application.\n` +
      `Target roles (HR / recruiters / hiring): ${c.hr_roles}.\n` +
      `Company: ${companyForSearch}\n` +
      `Title being applied for: ${extracted.title}\n` +
      `Location: ${extracted.location}\n\n` +
      `Use Google X-ray queries: site:linkedin.com/in/ AND (role terms) AND ("${companyForSearch}") AND ("${extracted.location}").\n` +
      `Return ONLY JSON: {"contacts":[{"name":string,"title":string,"company":string,"location":string,"linkedin_url":string,"type":"HR"|"connection"}]}`,
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

export const AGENT_DEFAULTS = DEFAULTS;
