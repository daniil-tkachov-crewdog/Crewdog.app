// Turns a workflow's raw result into the data the chat page renders as result
// cards. Deliberately a subset: the cards show what the user needs to decide
// whether to open a link, and these rows are stored with the message, so the
// evidence trail and the pipeline's internals stay out.

const str = (v) => (v == null ? "" : String(v).trim());
const list = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

// Where the cards sit in the reply. The model writes this marker on its own line;
// the app swaps it for the cards and strips it everywhere else.
export const CARDS_MARKER = "::cards::";

// Where the model's suggested next prompts sit, after the reply text (see
// src/types/chatResults.ts for the client-side copy).
export const SUGGESTIONS_MARKER = "::next::";

// Appended to the admin-set system prompt. Every reply ends with a short list of
// next things the user could ask; the app renders them as buttons, so the prose
// itself must not end on a question.
export const SUGGESTIONS_CONTRACT = [
  "NEXT STEPS",
  "",
  "Never end your reply by asking the user what they would like to do next, and never offer options in the prose. The app shows the next steps as buttons instead.",
  `Instead, end every reply with the marker ${SUGGESTIONS_MARKER} alone on its own line, followed by two to four suggested next prompts, one per line, nothing else after them.`,
  "Write each suggestion as the user would type it, in the first person, under about 60 characters, with no numbering, bullets or quotes.",
  "Make them concrete and specific to what was just discussed \u2014 reuse the actual role, company, people or town in question rather than writing a generic prompt.",
  "Cover genuinely different next moves across the things Crewdog can do: find jobs, find the people hiring for a role, find candidates for a vacancy, and find somewhere to live near a site.",
  "After a job search, one of the suggestions should offer to find accommodation near those jobs.",
  "The only time you may ask the user a direct question in the prose is when a search genuinely cannot run without an answer from them (for example the area or the kind of place they want to live in). Even then, still end with the marker and suggestions.",
].join("\n");

// Also appended to the admin-set system prompt, for the same reason the
// suggestions contract is: it is a contract between the model and the app, not
// editable copy.
//
// It exists because a turn with no tool call has no results to render, so the
// reply comes out as prose — and the model, having every earlier result in its
// context, answers from those instead of searching. "Don't repeat yourself"
// then produced a plain markdown list of the jobs it had just shown as cards.
// The model cannot be the one to decide a follow-up is conversation.
export const WORKFLOW_CONTRACT = [
  "SEARCHING",
  "",
  "Jobs, people and places to live reach the user as cards, built from the search tools. Never write a job, a person or a property into your own prose — not a list, not a line, not a link, not \"as I mentioned\" — and never answer from results that are already in this conversation. If a reply would name one, you must call the tool instead.",
  "Every follow-up about a search you have already run is another call to the same tool, however it is worded: \"more\", \"any others?\", \"don't repeat yourself\", \"none of these are good\", \"what about Oslo?\", \"cheaper\", \"only permanent ones\". Carry the earlier criteria over and add what they just said. The tool sees this whole conversation and will not return what it already showed.",
  "The only replies that need no tool call are the ones that genuinely search for nothing: a question about something already on screen, a criterion you have to ask for before you can search, or a request outside what Crewdog covers.",
].join("\n");

// Replaces the workflow's own presentation prompt whenever its results are
// shown as cards, so the reply does not print the same list twice.
export const CARDS_PRESENTATION = [
  "The app shows these results to the user as interactive cards, each with its details and a button to open the link. Do NOT list the results, their links or their details yourself.",
  "",
  `Write one or two short sentences that sum up what was found (how many, and what stands out), then the marker ${CARDS_MARKER} alone on its own line. Do not ask a follow-up question in the text \u2014 the app offers the next steps as buttons.`,
  "Use **bold** sparingly for the key number. No headings, no bullet lists, no URLs.",
  "When the results are empty, write no marker: say in one line that nothing was found and suggest which criterion to relax.",
].join("\n");

function people(name, args, result) {
  if (name === "find_linkedin_connections") {
    const items = (result?.contacts ?? [])
      .map((p) => ({
        name: str(p?.name),
        title: str(p?.title),
        company: str(p?.company),
        location: str(p?.location),
        url: str(p?.linkedin_url),
        tag: p?.type === "HR" ? "HR" : "Connection",
      }))
      .filter((p) => p.name && p.url);
    const company = str(result?.verification?.canonical_name || result?.extracted?.company);
    return {
      kind: "people",
      items,
      summary: {
        label: `Searched LinkedIn${company ? ` for ${company}` : ""} · ${items.length} found`,
        steps: [
          company && ["Company", company],
          str(result?.extracted?.title) && ["Role", str(result.extracted.title)],
          str(result?.extracted?.location) && ["Location", str(result.extracted.location)],
        ].filter(Boolean),
      },
    };
  }

  // One flat list. Someone who has publicly said they are free is highlighted;
  // everyone else is an ordinary match, and nobody is ranked away.
  const items = (result?.people ?? [])
    .map((p) => {
      const signal = str(p?.availability_signal);
      return {
        name: str(p?.name),
        title: str(p?.title),
        company: str(p?.company),
        location: str(p?.location),
        url: str(p?.linkedin_url),
        tier: signal ? "available" : "match",
        available: Boolean(signal),
        signal,
      };
    })
    .filter((p) => p.name && p.url);
  const nAvailable = items.filter((p) => p.available).length;
  return {
    kind: "people",
    items,
    summary: {
      label: `Searched LinkedIn · ${items.length} found`,
      steps: [
        ["Searched", str(args?.request) || str(result?.request)],
        nAvailable && [
          "Available",
          `${nAvailable} ${nAvailable === 1 ? "says" : "say"} they are open to work`,
        ],
      ].filter(Boolean),
    },
  };
}

// "6 expired or closed, 1 blocked our check" from a verifyLinks stats block.
function linkStep(check, goneWords) {
  if (!check || check.skipped) return null;
  const parts = [];
  if (check.dead) parts.push(`${check.dead} ${goneWords}`);
  if (check.unknown) parts.push(`${check.unknown} blocked our check`);
  return ["Checked links", parts.length ? parts.join(", ") : `all ${check.checked ?? 0} live`];
}

function jobs(args, result) {
  const items = (result?.jobs ?? [])
    .map((j) => ({
      title: str(j?.title),
      company: str(j?.company),
      location: str(j?.location),
      salary: str(j?.salary),
      status_text: str(j?.status_text),
      employment_type: str(j?.employment_type),
      posted_date: str(j?.posted_date),
      source: str(j?.source),
      url: str(j?.url),
      is_agency: Boolean(j?.is_agency),
      source_type: j?.source_type === "board" ? "board" : "direct",
      // true: proven live; false: the site blocked the check; null: not checked.
      verified: typeof j?.verified === "boolean" ? j.verified : null,
    }))
    .filter((j) => j.title && j.url);
  const nDirect = items.filter((j) => j.source_type === "direct").length;
  const nBoard = items.length - nDirect;
  return {
    kind: "jobs",
    items,
    summary: {
      label: `Searched job adverts · ${Number(result?.found_count) || 0} found · ${items.length} still open`,
      steps: [
        ["Searched", str(args?.request) || str(result?.request)],
        [
          "Sources",
          [
            nDirect && `${nDirect} direct from employers`,
            nBoard && `${nBoard} via boards, platforms or agencies`,
          ].filter(Boolean).join(", ") || "company career pages, boards and agencies",
        ],
        linkStep(result?.link_check, "expired or closed"),
      ].filter(Boolean),
    },
  };
}

function places(result) {
  const items = (result?.places ?? [])
    .map((h) => ({
      title: str(h?.title),
      location: str(h?.location),
      price: str(h?.price),
      bills: str(h?.bills_included),
      available_from: str(h?.available_from),
      status_text: str(h?.status_text),
      furnished: str(h?.furnished),
      listed_by: str(h?.listed_by),
      source: str(h?.source),
      url: str(h?.url),
      matches: list(h?.matches),
      misses: list(h?.misses),
    }))
    .filter((h) => h.title && h.url);
  const c = result?.criteria ?? {};
  return {
    kind: "places",
    items,
    summary: {
      label: `Searched ${result?.listing_type === "buy" ? "property for sale" : "rentals"} · ${Number(result?.found_count) || 0} found · ${items.length} available`,
      steps: [
        ["Searched", [str(c.place_type), str(c.location), str(c.budget), str(c.move_in_date), ...list(c.requirements)].filter(Boolean).join(", ")],
        linkStep(result?.link_check, "let agreed or withdrawn"),
      ].filter(Boolean),
    },
  };
}

// One card group for a workflow run, or null when it has nothing to show as cards.
export function toCardGroup(name, args, result) {
  if (!result || result.error) return null;
  let group = null;
  if (name === "find_linkedin_professionals" || name === "find_linkedin_connections") {
    group = people(name, args, result);
  } else if (name === "find_jobs") {
    group = jobs(args, result);
  } else if (name === "find_accommodation") {
    group = places(result);
  }
  return group && group.items.length ? group : null;
}

// Splits a reply into its prose and the suggested next prompts the model wrote
// after the marker. A reply without the marker simply yields no suggestions.
// Appended to whichever presentation instruction rides back with a tool result.
//
// The system prompt alone is not enough here: every presentation instruction
// ends by telling the model to stop ("no closing summary", "no closing sales
// pitch"), and a tool output is both later in the context and more specific
// than the system prompt, so the model obeys it and never writes the marker.
// The exemption has to travel with the instruction it is an exemption to.
export const SUGGESTIONS_TAIL = [
  `Last of all, after everything above, end your reply with the marker ${SUGGESTIONS_MARKER} alone on its own line, followed by two to four suggested next prompts, one per line, and nothing after them.`,
  "This is REQUIRED, and it overrides anything above telling you to write no closing line, no closing summary or no closing sales pitch. Those rules are about prose; the marker and its lines are not prose. The app strips them out of the message and renders them as buttons, so the user never reads them as text.",
  "Write each one as the user would type it, in the first person, under about 60 characters, no numbering, bullets or quotes.",
  "Make them specific to what was just found \u2014 use the actual roles, companies, people or towns in the results, not generic phrasing.",
  "Vary what they offer across what Crewdog does: find jobs, find the people hiring for a role, find candidates for a vacancy, find somewhere to live near a site. After a job search, one of them should offer to find accommodation near those jobs.",
].join("\n");

export function splitSuggestions(reply) {
  const text = String(reply ?? "");
  const at = text.indexOf(SUGGESTIONS_MARKER);
  if (at === -1) return { text: text.trim(), suggestions: [] };
  const suggestions = text
    .slice(at + SUGGESTIONS_MARKER.length)
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .map((l) => l.replace(/^["'“‘]|["'”’]$/g, "").trim())
    .filter(Boolean)
    .slice(0, 4);
  return { text: text.slice(0, at).trim(), suggestions };
}
