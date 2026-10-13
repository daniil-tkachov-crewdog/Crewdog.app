// The Pro-mode output contract.
//
// Normal mode asks the model for prose and lets four function-tools return the
// cards. Pro mode has no tools of its own, so the whole answer — intro text,
// cards and follow-up suggestions — has to come back in one shot. It does that
// through OpenAI Structured Outputs: the schema below is handed to the API as
// `text.format`, and with `strict: true` the model is grammar-constrained to it.
// The shape cannot come back wrong, which is the entire point of the mode.
//
// It mirrors src/types/chatResults.ts field for field, so the cards the chat
// page already renders need no changes at all.
//
// Three strict-mode rules shape what follows, and are why this is not just the
// TypeScript types pasted in:
//   1. every object carries "additionalProperties": false
//   2. EVERY property must be listed in "required" — optionality is expressed
//      by making the type nullable, e.g. ["string", "null"], not by omission
//   3. there are no tuple types, so ResultSummary.steps — a [label, text] pair
//      in TypeScript — is an object here, and fromProJson() in chatResults.js
//      maps it back.
//
// This module is the single source of truth: the migration seeds the admin
// column from it, GET /api/pro-schema serves it to the admin's reset button,
// and /api/chat falls back to it when the saved schema will not parse.

const str = { type: "string" };
const nullableStr = { type: ["string", "null"] };
const strArray = { type: "array", items: { type: "string" } };

// Mirrors JobResult (src/types/chatResults.ts).
const JOB = {
  type: "object",
  additionalProperties: false,
  required: [
    "title", "company", "location", "salary", "status_text",
    "employment_type", "posted_date", "source", "url", "is_agency",
    "verified", "source_type",
  ],
  properties: {
    title: str,
    company: str,
    location: str,
    salary: { ...str, description: "Advertised pay, or an empty string if the advert does not say." },
    status_text: { ...str, description: "Short note on whether the advert is still open." },
    employment_type: { ...str, description: "Permanent, contract, temporary, part-time…" },
    posted_date: { ...str, description: "When the advert went up, as written on the source." },
    source: { ...str, description: "Host the advert lives on, e.g. 'greenhouse.io'." },
    url: { ...str, description: "Direct link to the advert itself, never to a search page." },
    is_agency: { type: "boolean", description: "True when a recruitment agency posted it, not the employer." },
    verified: { type: ["boolean", "null"], description: "Link confirmed reachable; null when unchecked." },
    source_type: {
      type: "string",
      enum: ["direct", "board"],
      description: "'direct' for the employer's own careers page, 'board' for a job board or agency listing.",
    },
  },
};

// Mirrors PlaceResult.
const PLACE = {
  type: "object",
  additionalProperties: false,
  required: [
    "title", "location", "price", "bills", "available_from",
    "status_text", "furnished", "listed_by", "source", "url",
    "matches", "misses",
  ],
  properties: {
    title: str,
    location: str,
    price: { ...str, description: "Rent or asking price with its period, e.g. '£1,450 pcm'." },
    bills: { ...str, description: "What the price includes." },
    available_from: str,
    status_text: { ...str, description: "Short note on availability." },
    furnished: str,
    listed_by: { ...str, description: "Landlord, agency or platform." },
    source: { ...str, description: "Host the listing lives on." },
    url: str,
    matches: { ...strArray, description: "Criteria from the user's request this listing meets." },
    misses: { ...strArray, description: "Criteria it does not meet. Never hide these." },
  },
};

// Mirrors PersonResult.
const PERSON = {
  type: "object",
  additionalProperties: false,
  required: [
    "name", "title", "company", "location", "url", "tier", "available",
    "signal", "signal_source", "signal_date", "matched", "unconfirmed",
    "confidence", "routes", "tag",
  ],
  properties: {
    name: str,
    title: { ...str, description: "Their job title." },
    company: str,
    location: str,
    url: { ...str, description: "LinkedIn profile URL." },
    tier: {
      type: "string",
      enum: ["available", "match", "unconfirmed"],
      description:
        "'available' when they are advertising they are open to work, 'match' when the evidence confirms the criteria, 'unconfirmed' when found but unproven.",
    },
    available: { type: "boolean", description: "True only with evidence they are open to work." },
    signal: { ...nullableStr, description: "The quote or post that shows availability." },
    signal_source: { ...nullableStr, description: "Where that signal came from." },
    signal_date: { ...nullableStr, description: "When the signal was published." },
    matched: { ...strArray, description: "Criteria the evidence confirms." },
    unconfirmed: { ...strArray, description: "Criteria the evidence could not confirm." },
    confidence: { type: "number", description: "0 to 1." },
    routes: { ...strArray, description: "How you could reach them." },
    tag: { ...nullableStr, description: "Workflow-1 contacts only: 'HR' or 'Connection'." },
  },
};

// Mirrors ResultSummary. The TypeScript type is a [label, text] tuple; strict
// mode has no tuples, so it is an object here and mapped back on arrival.
const SUMMARY = {
  type: "object",
  additionalProperties: false,
  required: ["label", "steps"],
  properties: {
    label: { ...str, description: "One line on what was searched, e.g. 'Searched job adverts'." },
    steps: {
      type: "array",
      description: "What the search did, step by step. Shown folded under the summary line.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "text"],
        properties: { label: str, text: str },
      },
    },
  },
};

export const PRO_SCHEMA_DEFAULT = {
  name: "crewdog_pro_search",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["reply", "results", "suggestions"],
    properties: {
      reply: {
        type: "string",
        description:
          "The prose answer, shown above the cards. Never list the results here — they are rendered as cards. Empty string if there is nothing to add.",
      },
      results: {
        type: "array",
        description:
          "One group per kind of result. Empty array when the message needs no search.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "summary", "items"],
          properties: {
            kind: {
              type: "string",
              enum: ["jobs", "places", "people"],
              description:
                "'jobs' for job adverts, 'places' for accommodation, 'people' for LinkedIn profiles. Every item in the group must match the kind.",
            },
            summary: SUMMARY,
            items: { type: "array", items: { anyOf: [JOB, PLACE, PERSON] } },
          },
        },
      },
      suggestions: {
        type: "array",
        description:
          "Up to three short follow-up prompts, written as the user would type them. Rendered as buttons. Empty array if none fit.",
        items: { type: "string" },
      },
    },
  },
};

export const PRO_SCHEMA_DEFAULT_TEXT = JSON.stringify(PRO_SCHEMA_DEFAULT, null, 2);
