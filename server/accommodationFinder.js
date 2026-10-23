// Workflow 4 — "Accommodation Finder" pipeline.
// a location + a type of place -> one web search pass over live property
// adverts -> dedupe and cap in JS -> a list of places with type, location,
// price, availability and a link.
//
// Shaped like the job finder rather than the people finders: one search pass is
// the whole model side of the pipeline. What follows it is a pass over the live
// pages (see linkCheck.js), because a web search reads an index and an index is
// a snapshot — and a let-agreed room is exactly the page that sits still long
// enough to be indexed well. Every surviving URL is fetched before the user
// sees it, at no token cost.
//
// Unlike the job finder this one has two required criteria. A property search
// without a location returns noise, and "a place in Dublin" without knowing
// whether they want a room or a house returns the wrong half of the market —
// so the tool refuses and tells the chatbot which answer it is still missing.
// Everything else the user volunteers (budget, bedrooms, bills included, pets,
// parking, a date) narrows the search but never blocks it.

import { outputText } from "./functions/openai/outputText.js";
import { addUsage } from "./functions/openai/addUsage.js";
import { parseJsonOrDefault as parseJson } from "./functions/json/parseJsonOrDefault.js";
import { renderTemplate as render } from "./functions/text/renderTemplate.js";
import { today } from "./functions/date/today.js";
import { ACCOMMODATION_FINDER_DEFAULTS as DEFAULTS } from "./agentPrompts.js";
import { verifyLinks, parsePhrases, PROPERTY_EXPIRY_PHRASES } from "./linkCheck.js";

import { str } from "./functions/text/str.js";
import { normalizeListingUrl } from "./functions/url/normalizeListingUrl.js";
import { isListingUrl } from "./functions/url/isListingUrl.js";

// Strip tracking params and trailing slashes so the same property found twice
// under two campaign URLs collapses to one listing. Any host is accepted — a
// property legitimately lives on a portal, an agent's own site or a landlord's
// page — so the only shape rule is "an http(s) URL with a host".
const TRACKING_PARAM = /^(utm_|ref$|source$|src$|trk$|trackid$|campaign|cid$|gclid$|fbclid$)/i;

// Bound to the accommodation finder's own tracking-parameter list: it
// strips the ad-click ids (gclid, fbclid, cid) that portals carry and the
// job finder never sees, which is why the two lists stay separate.
const normalizeUrl = (url) => normalizeListingUrl(url, TRACKING_PARAM);

export async function runAccommodationFinder(openai, args = {}, cfg = {}, model = "gpt-4o") {
  const c = { ...DEFAULTS, ...cfg };
  const usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0, requests: 0 };

  // 1) Normalize the criteria coming off the tool call. Location and place type
  // are the two the search cannot do without; the rest are refinements.
  const a = args ?? {};
  const location = str(a.location);
  const placeType = str(a.place_type);
  const budget = str(a.budget);
  const moveInDate = str(a.move_in_date);
  const requirements = (Array.isArray(a.requirements) ? a.requirements : [])
    .map(str)
    .filter(Boolean)
    .slice(0, 10);

  // 2) Refuse rather than guess. The chatbot is told which answers are missing
  // so it can ask for exactly those and call the tool again.
  const missing = [];
  if (!location) missing.push("location");
  if (!placeType) missing.push("place_type");
  if (missing.length) {
    return {
      result: {
        error: "missing_criteria",
        missing,
        note:
          "Ask the user for " +
          (missing.length === 2
            ? "the area they want to live in and what kind of place they are after (a room, a flat, a house, a studio, a houseshare)"
            : missing[0] === "location"
              ? "the town, city or area they want to live in"
              : "what kind of place they are after (a room, a flat, a house, a studio, a houseshare)") +
          ", then call this tool again. Budget and any other conditions are optional — do not hold up the search waiting for them.",
      },
      usage,
    };
  }

  const maxResults = Math.max(1, Math.min(50, Number(c.accom_max_results) || 8));
  const verifyEnabled = c.accom_verify_links !== false;
  // Verification drops listings, so the search has to bring back more than the
  // list needs. A short list is the one outcome this change must not produce.
  const overFetch = Math.min(40, maxResults * (verifyEnabled ? 3 : 2));
  const maxAgeDays = Math.max(1, Number(c.accom_max_age_days) || 30);
  const listingType = c.accom_listing_type === "buy" ? "buy" : "rent";

  // The switch picks the prompt, and nothing else in the pipeline changes: the
  // difference between renting and buying is entirely a matter of what the
  // search is told to look for and how it reads a price.
  const instructions =
    listingType === "buy"
      ? c.accom_search_instructions_buy
      : c.accom_search_instructions_rent;

  // Every line of this is an editable field in the admin panel.
  const searchResp = await openai.responses.create({
    model,
    instructions,
    tools: [{ type: "web_search" }],
    input: render(c.accom_run_instruction || DEFAULTS.accom_run_instruction, {
      want: overFetch,
      listing_type: listingType === "buy" ? "buy" : "rent",
      location,
      place_type: placeType,
      budget: budget || (c.accom_no_budget_line ?? DEFAULTS.accom_no_budget_line),
      move_in_date_line: moveInDate ? `Wanted from: ${moveInDate}` : "",
      requirements_line: requirements.length
        ? `Other conditions they asked for: ${requirements.join(", ")}`
        : "",
      today: today(),
      max_age_days: maxAgeDays,
      conditions_rule: requirements.length
        ? c.accom_conditions_given_rule ?? DEFAULTS.accom_conditions_given_rule
        : c.accom_no_conditions_rule ?? DEFAULTS.accom_no_conditions_rule,
    }),
  });
  addUsage(usage, searchResp);
  const out = parseJson(outputText(searchResp), { places: [], note: "" });
  const rawPlaces = Array.isArray(out.places) ? out.places : [];

  // 4) Dedupe on the normalised listing URL. No cap here: it falls after
  // verification, or a pass that drops six of eight hands back two.
  const byUrl = new Map();
  for (const place of rawPlaces) {
    const url = normalizeUrl(place?.url);
    if (!url || !isListingUrl(url)) continue;
    if (byUrl.has(url)) continue;
    byUrl.set(url, {
      title: str(place?.title),
      place_type: str(place?.place_type),
      location: str(place?.location),
      price: str(place?.price),
      bedrooms: str(place?.bedrooms),
      available_from: str(place?.available_from),
      furnished: str(place?.furnished),
      bills_included: str(place?.bills_included),
      listed_by: str(place?.listed_by),
      status_text: str(place?.status_text),
      source: str(place?.source),
      url,
      matches: (Array.isArray(place?.matches) ? place.matches : []).map(str).filter(Boolean).slice(0, 10),
      misses: (Array.isArray(place?.misses) ? place.misses : []).map(str).filter(Boolean).slice(0, 10),
    });
    if (byUrl.size >= overFetch) break;
  }
  const candidates = [...byUrl.values()];

  // 5) Follow every link. A 404, a "this property has been let" banner on an
  // otherwise healthy 200, or a bounce to the portal's search page all mean the
  // listing is gone. A 403 from a portal that blocks datacentre IPs means only
  // that we were blocked, so those stay in, flagged.
  let places = candidates;
  let checkStats = null;
  let droppedDead = [];
  if (verifyEnabled) {
    const { kept, dropped, stats } = await verifyLinks(candidates, {
      phrases: parsePhrases(c.accom_expiry_phrases, PROPERTY_EXPIRY_PHRASES),
      isDeadEndUrl: (u) => !isListingUrl(u),
    });
    places = kept;
    checkStats = stats;
    droppedDead = dropped;
  }
  places = places.slice(0, maxResults);

  return {
    result: {
      criteria: {
        location,
        place_type: placeType,
        budget,
        move_in_date: moveInDate,
        requirements,
      },
      listing_type: listingType,
      max_age_days: maxAgeDays,
      places,
      found_count: rawPlaces.length,
      dropped_count: rawPlaces.length - places.length,
      link_check: checkStats
        ? { ...checkStats, dropped: droppedDead.slice(0, 10) }
        : { skipped: true },
      note: str(out.note),
      // Handed back as tool output rather than as system instructions, the same
      // way workflows 2 and 3 do it, so the chat model formats the list.
      presentation: c.accom_compress_instructions,
    },
    usage,
  };
}
