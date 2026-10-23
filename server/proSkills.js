// Pro mode's skills, read from Supabase at the moment the model asks for one.
//
// The whole point of the skills table is that its contents are NOT in the
// system prompt, so they have to be fetched mid-turn. That makes this module a
// hard dependency of a Pro answer: if it cannot read, Pro cannot search, and
// saying so is better than answering half-equipped from the core prompt alone.
// Hence the retries, and hence the throw at the end of them.
//
// Read as the calling user with the anon key and their bearer token, the same
// way usage.js reaches app_settings. The table's select policy covers any
// signed-in user, so no service-role key is needed and no new secret exists.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

// Three attempts in total, backing off between them. A skill fetch sits in the
// middle of a turn the user is already waiting on, so this buys resilience
// against a blip without turning a real outage into a thirty-second stall.
const ATTEMPTS = 3;
const BACKOFF_MS = [0, 400, 1200];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class SkillsUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = "SkillsUnavailableError";
  }
}

async function query(accessToken, params) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new SkillsUnavailableError("Supabase is not configured");
  }
  let lastError = null;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (BACKOFF_MS[attempt]) await sleep(BACKOFF_MS[attempt]);
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/app_pro_skills?${params}`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
            Accept: "application/json",
          },
        }
      );
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}: ${await res.text()}`);
        continue;
      }
      return await res.json();
    } catch (err) {
      lastError = err;
    }
  }
  console.error("[proSkills]", lastError?.message || lastError);
  throw new SkillsUnavailableError(
    `Could not read the skills table after ${ATTEMPTS} attempts`
  );
}

// The menu the core prompt advertises: every enabled skill, name and the one
// line about when to call it. Never the bodies — those are the whole saving.
export async function listSkills(accessToken) {
  const rows = await query(
    accessToken,
    "select=slug,name,call_instruction,auto_with&enabled=is.true&order=sort_order.asc,name.asc"
  );
  return (Array.isArray(rows) ? rows : []).filter((r) => r?.slug);
}

// The bodies for the slugs the model asked for, plus anything those skills are
// configured to ride along with, in one round trip. Unknown or disabled slugs
// are dropped rather than erroring: the model asking for something that no
// longer exists is not a reason to fail the user's turn.
export async function getSkillPrompts(accessToken, slugs) {
  const wanted = [...new Set((slugs ?? []).filter(Boolean))];
  if (!wanted.length) return [];

  const list = wanted.map((s) => `"${String(s).replace(/"/g, "")}"`).join(",");
  const first = await query(
    accessToken,
    `select=slug,name,prompt,auto_with&enabled=is.true&slug=in.(${list})`
  );

  // One extra hop for the attachments, and only when there are any. The
  // catalogue is the reason this exists: it is reference material for a
  // search, useless alone and easy for the model to forget to ask for.
  const attached = [
    ...new Set(
      (first ?? []).flatMap((r) => r.auto_with ?? []).filter((s) => !wanted.includes(s))
    ),
  ];
  let extra = [];
  if (attached.length) {
    const alist = attached.map((s) => `"${String(s).replace(/"/g, "")}"`).join(",");
    extra = await query(
      accessToken,
      `select=slug,name,prompt&enabled=is.true&slug=in.(${alist})`
    );
  }

  return [...(first ?? []), ...(extra ?? [])].map((r) => ({
    slug: r.slug,
    name: r.name,
    prompt: String(r.prompt ?? ""),
  }));
}

// The block appended to the core prompt. Name and call instruction only — a
// skill's body is never advertised, or there would be nothing to load.
export function renderSkillMenu(skills) {
  if (!skills.length) return "";
  return [
    "AVAILABLE SKILLS",
    "",
    "Your detailed instructions for each kind of search are not in this prompt.",
    "They are skills you load with the load_skill tool, which returns the full",
    "instructions as its result. Load every skill a message needs BEFORE you",
    "search or answer, in one call, and follow what comes back exactly — it",
    "overrides any general guidance here. A skill stays loaded for the rest of",
    "the conversation, so do not reload one you already have.",
    "",
    "If a message needs none of them, answer without loading anything — but then",
    "you must not return any results, because you do not have the rules for",
    "building them.",
    "",
    ...skills.map((s) => `- ${s.slug} (${s.name}): ${s.call_instruction}`),
  ].join("\n");
}
