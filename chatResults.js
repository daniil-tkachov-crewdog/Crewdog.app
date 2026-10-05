// Turns a workflow's raw result into the data the chat page renders as result
// cards. Deliberately a subset: the cards show what the user needs to decide
// whether to open a link, and these rows are stored with the message, so the
// evidence trail and the pipeline's internals stay out.

const str = (v) => (v == null ? "" : String(v).trim());
const list = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

// Where the cards sit in the reply. The model writes this marker on its own line;
// the app swaps it for the cards and strips it everywhere else.
export const CARDS_MARKER = "::cards::";

// Replaces the workflow's own presentation prompt whenever its results are
// shown as cards, so the reply does not print the same list twice.
export const CARDS_PRESENTATION = [
  "The app shows these results to the user as interactive cards, each with its details and a button to open the link. Do NOT list the results, their links or their details yourself.",
  "",
  `Write one or two short sentences that sum up what was found (how many, and what stands out), then the marker ${CARDS_MARKER} alone on its own line, then one short follow-up question offering a useful next step.`,
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

  // The three tiers the finder ranks people into, in the order they are read.
  const shape = (p, tier) => ({
    name: str(p?.name),
    title: str(p?.title),
    company: str(p?.company),
    location: str(p?.location),
    url: str(p?.linkedin_url),
    tier,
    available: tier === "available",
    signal: tier === "available" ? str(p?.availability_signal) : "",
    signal_source: tier === "available" ? str(p?.evidence_sources?.[0]) : "",
    signal_date: tier === "available" ? str(p?.signal_date) : "",
    matched: list(p?.matched_factors),
    unconfirmed: list(p?.unconfirmed_factors),
    confidence: Number(p?.confidence) || 0,
    routes: list(p?.discovery_routes),
  });
  const items = [
    ...(result?.available ?? []).map((p) => shape(p, "available")),
    ...(result?.others ?? []).map((p) => shape(p, "match")),
    ...(result?.unconfirmed ?? []).map((p) => shape(p, "unconfirmed")),
  ].filter((p) => p.name && p.url);
  const count = (t) => items.filter((p) => p.tier === t).length;
  const checked = Number(result?.checked_count) || 0;
  return {
    kind: "people",
    items,
    summary: {
      label: `Searched LinkedIn · ${checked} profiles checked · ${items.length} shown`,
      steps: [
        ["Searched", [str(args?.job_title), str(args?.location), ...list(args?.key_factors)].filter(Boolean).join(", ")],
        list(result?.routes).length && ["Routes", list(result.routes).join(", ")],
        [
          "Ranked",
          [
            count("available") && `${count("available")} with a recent availability signal`,
            count("match") && `${count("match")} confirmed against the criteria`,
            count("unconfirmed") && `${count("unconfirmed")} found but not confirmed`,
          ].filter(Boolean).join("; ") || "nobody found",
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
  const c = result?.criteria ?? {};
  const nDirect = items.filter((j) => j.source_type === "direct").length;
  const nBoard = items.length - nDirect;
  return {
    kind: "jobs",
    items,
    summary: {
      label: `Searched job adverts · ${Number(result?.found_count) || 0} found · ${items.length} still open`,
      steps: [
        ["Searched", [str(c.query), str(c.location), ...list(c.key_factors)].filter(Boolean).join(", ")],
        [
          "Sources",
          [
            nDirect && `${nDirect} direct from employers`,
            nBoard && `${nBoard} via job boards or agencies`,
          ].filter(Boolean).join(", ") ||
            (result?.include_agencies === false
              ? "employer career pages only"
              : "employer career pages, job boards and agencies"),
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
