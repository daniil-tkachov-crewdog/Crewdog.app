// Workflow 4 — "Accommodation Finder" pipeline.
// a location + a type of place -> one web search pass over live property
// adverts -> dedupe and cap in JS -> a list of places with type, location,
// price, availability and a link.
//
// Shaped like the job finder rather than the people finders: the listing page
// is the evidence, so one search pass is the whole pipeline and everything
// after it is cheap string work.
//
// Unlike the job finder this one has two required criteria. A property search
// without a location returns noise, and "a place in Dublin" without knowing
// whether they want a room or a house returns the wrong half of the market —
// so the tool refuses and tells the chatbot which answer it is still missing.
// Everything else the user volunteers (budget, bedrooms, bills included, pets,
// parking, a date) narrows the search but never blocks it.

import { outputText, addUsage, parseJson } from "./agent.js";
import { ACCOMMODATION_FINDER_DEFAULTS as DEFAULTS } from "./agentPrompts.js";

const str = (v) => String(v ?? "").trim();

// Strip tracking params and trailing slashes so the same property found twice
// under two campaign URLs collapses to one listing. Any host is accepted — a
// property legitimately lives on a portal, an agent's own site or a landlord's
// page — so the only shape rule is "an http(s) URL with a host".
const TRACKING_PARAM = /^(utm_|ref$|source$|src$|trk$|trackid$|campaign|cid$|gclid$|fbclid$)/i;

function normalizeUrl(url) {
  const raw = str(url);
  if (!/^https?:\/\//i.test(raw)) return "";
  try {
    const u = new URL(raw);
    if (!u.hostname.includes(".")) return "";
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAM.test(key)) u.searchParams.delete(key);
    }
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return u.toString();
  } catch {
    return "";
  }
}

// A portal's search results page or an area landing page is a place to look for
// a home, not a home. The search prompt says so; this is the backstop for when
// the model returns one anyway.
const NOT_A_LISTING =
  /\/(search|find|results|to-rent|for-rent|property-to-rent|rentals?|listings?|properties)\/?$|[?&](q|query|keywords|search|searchType|locationIdentifier)=/i;

function isListingUrl(url) {
  try {
    const u = new URL(url);
    if (u.pathname === "/" || u.pathname === "") return false;
    return !NOT_A_LISTING.test(u.pathname + u.search);
  } catch {
    return false;
  }
}

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
  const maxAgeDays = Math.max(1, Number(c.accom_max_age_days) || 30);
  const listingType = c.accom_listing_type === "buy" ? "buy" : "rent";

  // The switch picks the prompt, and nothing else in the pipeline changes: the
  // difference between renting and buying is entirely a matter of what the
  // search is told to look for and how it reads a price.
  const instructions =
    listingType === "buy"
      ? c.accom_search_instructions_buy
      : c.accom_search_instructions_rent;

  const criteriaBlock =
    `Where they want to live: ${location}\n` +
    `Kind of place: ${placeType}\n` +
    (budget ? `Budget: ${budget}\n` : "Budget: not specified — do not filter on price, and state each price as the listing gives it.\n") +
    (moveInDate ? `Wanted from: ${moveInDate}\n` : "") +
    (requirements.length ? `Other conditions they asked for: ${requirements.join(", ")}\n` : "");

  // 3) One search pass.
  const searchResp = await openai.responses.create({
    model,
    instructions,
    tools: [{ type: "web_search" }],
    input:
      `Find up to ${maxResults * 2} currently available places to ${
        listingType === "buy" ? "buy" : "rent"
      }.\n` +
      criteriaBlock +
      `\nToday is ${new Date().toISOString().slice(0, 10)}. Do not return a listing you can see was added more than ${maxAgeDays} days ago, or one the page shows as let, sold, under offer or withdrawn.\n` +
      (requirements.length
        ? `The conditions above came from the user. Treat them as filters where the listing states enough to judge, and say in the note when you had to relax one to fill the list.\n`
        : `The user gave no conditions beyond the location and the kind of place, so return the best spread of what is actually available.\n`) +
      `\nReturn ONLY JSON: {"places":[{"title":string,"place_type":string,"location":string,"price":string,"bedrooms":string,"available_from":string,"furnished":string,"bills_included":string,"listed_by":string,"source":string,"url":string,"matches":[string],"misses":[string]}],"note":string}\n` +
      `matches and misses: which of the user's stated conditions this listing meets and which it does not, using their own words. Leave both empty when they gave no conditions.`,
  });
  addUsage(usage, searchResp);
  const out = parseJson(outputText(searchResp), { places: [], note: "" });
  const rawPlaces = Array.isArray(out.places) ? out.places : [];

  // 4) Dedupe on the normalised listing URL and cap. A place without a usable
  // link is not something the user can enquire about, so it is dropped rather
  // than shown with no way in.
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
      source: str(place?.source),
      url,
      matches: (Array.isArray(place?.matches) ? place.matches : []).map(str).filter(Boolean).slice(0, 10),
      misses: (Array.isArray(place?.misses) ? place.misses : []).map(str).filter(Boolean).slice(0, 10),
    });
    if (byUrl.size >= maxResults) break;
  }
  const places = [...byUrl.values()];

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
      note: str(out.note),
      // Handed back as tool output rather than as system instructions, the same
      // way workflows 2 and 3 do it, so the chat model formats the list.
      presentation: c.accom_compress_instructions,
    },
    usage,
  };
}
