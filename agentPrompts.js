import { JOB_EXPIRY_PHRASES, PROPERTY_EXPIRY_PHRASES } from "./linkCheck.js";

// Default prompts and limits for both AI agent workflows.
//
// Single source of truth: the server pipelines (agent.js, linkedinFinder.js)
// merge these under whatever the admin saved, and the admin sub-tabs
// (src/pages/admin/agent/*) show them as the starting text, so an untouched
// install displays exactly the prompts it actually runs.

// Workflow 1 — "Job description".
export const JOB_DESCRIPTION_DEFAULTS = {
  max_contacts: 8,
  hr_roles:
    '"human resources", "recruiter", "talent acquisition", "hiring manager", "people team", "HR"',
  extract_instructions: [
    "You extract structured hiring data from a job description.",
    "",
    "Return the hiring company, simplified company name variants, the job title and the job location.",
    "- Company: the employer actually hiring, not a staffing agency posting on their behalf, unless the agency is the employer.",
    "- Company simplified: the name without legal suffixes (Ltd, GmbH, Inc, plc) and without group/division qualifiers, so it can be matched against LinkedIn headlines.",
    "- Title: the posted title, cleaned of req numbers, seniority codes and location tags.",
    "- Location: the work location as a city and country. If the role is remote, say so and keep the anchor location when one is given.",
    "",
    "Leave a field as an empty string when the job description genuinely does not say. Never invent a company or a location.",
  ].join("\n"),
  verify_instructions: [
    "You verify that a company is real, using web search.",
    "",
    "Search for the company, confirm it exists as a genuine employer, and identify its canonical name and primary website domain.",
    "- Prefer the company's own site and its LinkedIn company page as evidence.",
    "- Use the location to disambiguate when several companies share a name; pick the one that matches.",
    "- Set exists to false when nothing credible turns up, and explain what you looked for in the note.",
    "- Return the bare domain (example.com), not a full URL.",
    "",
    "Do not guess a domain from the company name; only return one you actually saw.",
  ].join("\n"),
  search_instructions: [
    "You find real LinkedIn member profiles via web search, so a candidate can reach a human about a specific job opening.",
    "",
    "Use Google X-ray queries of the form:",
    'site:linkedin.com/in/ AND (role terms) AND ("company") AND ("location")',
    "",
    "Rules:",
    "- Return only genuine linkedin.com/in/ profile URLs. Never company pages, job posts, LinkedIn search URLs, or other sites.",
    "- Every profile must be a real person you found in the search results, with the URL copied exactly as it appeared. Never construct a profile URL from someone's name.",
    "- Prefer people who currently work at the company over people who used to.",
    "- Mark someone HR when they recruit or hire (recruiter, talent acquisition, HR, people team, hiring manager), and connection when they simply work there in or near the target team.",
    "- Lead with HR contacts, then the most relevant connections.",
    "- Return fewer people rather than padding the list with weak or uncertain matches.",
  ].join("\n"),
};

// Discovery routes for workflow 2. The same person is reachable from several
// directions, and the strongest signal — someone saying they are free — is
// rarely on the profile itself, so each route is its own search pass and the
// results are merged on the profile URL.
//
// Each enabled route costs one extra web search call per run, which is why the
// two cheap, general ones are on by default and the rest are opt-in.
export const FINDER_ROUTES = [
  {
    key: "person",
    label: "Person first",
    default: true,
    description: "People whose experience matches the requirement, by title and by skill.",
    focus: [
      "Find people whose current or previous experience matches the requirement.",
      "Search the exact job title, adjacent titles, and the alternative terminology used for the same or transferable skills in this discipline and sector — a title alone is not the requirement.",
      "Weigh discipline, sector, project type and named clients as heavily as the title itself.",
    ].join("\n"),
  },
  {
    key: "availability",
    label: "Availability",
    default: true,
    description: "Posts and headlines where people say they are free or looking.",
    focus: [
      "Find people in this discipline and location who have publicly signalled that they are available or looking.",
      'Search for: "open to work", "#OpenToWork", "available immediately", "looking for work", "looking for my next contract", "seeking a new role", "interested in opportunities", "available from", "available for rotation", "between roles", "currently available".',
      "Record the signal wording and the date it was posted. An undated or old signal is not evidence that someone is free now.",
    ].join("\n"),
  },
  {
    key: "vacancy",
    label: "Vacancy comments",
    default: false,
    description: "Recruiter posts, then the people replying that they are interested.",
    focus: [
      "Find recent vacancies and recruiter posts relevant to the requirement, then look at their public comments for people putting themselves forward.",
      'Search comment wording such as "interested", "available", "CV sent", "DM sent", "please contact me", "I have X years experience", "available immediately".',
      "A comment establishes interest, never competence. Capture the person and the comment, and leave their technical match to be established from their profile.",
    ].join("\n"),
  },
  {
    key: "project",
    label: "Project completion",
    default: false,
    description: "People announcing a contract or project is ending.",
    focus: [
      "Find people announcing that a project, assignment or contract is ending.",
      'Search for "finishing my contract", "project completed", "coming to the end of", "last day", "demobilising", "available next month" and equivalents.',
      "Capture what they were doing on that project, and the date the post was made.",
    ].join("\n"),
  },
  {
    key: "team",
    label: "Team availability",
    default: false,
    description: "Crews and groups coming off a project together.",
    focus: [
      "Find groups of workers becoming available, not only individuals.",
      'Search for "our team is available", "crew available", "engineers available", "coming off project", "available for mobilisation".',
      "Capture who speaks for the group and how many people it covers.",
    ].join("\n"),
  },
];

// Workflow 2 — "LinkedIn finder".
export const LINKEDIN_FINDER_DEFAULTS = {
  finder_max_results: 9,
  finder_min_confidence: 0.5,
  finder_routes: FINDER_ROUTES.filter((r) => r.default).map((r) => r.key),
  finder_signal_max_age_days: 90,
  finder_extra_factor_hints:
    "availability (open to work / actively looking), company, seniority, industry, skills, certifications, language, current vs past employer",
  finder_search_instructions: [
    "You search public professional sources for evidence about people, so a recruiter can approach the right ones. You are not browsing profiles: you are collecting evidence, and a strong candidate is often assembled from several individually weak signals — occupation, a named project, location history, an open-to-work post, a comment on a vacancy.",
    "",
    "These instructions are occupation agnostic. They apply to engineers, technicians, inspectors, trades, consultants, supervisors, project managers and whole crews alike.",
    "",
    "Work the discovery route you are given for this pass, using Google X-ray queries against linkedin.com — profiles, posts and the public comments under posts:",
    'site:linkedin.com/in/ "job title" "location" "key factor", and site:linkedin.com/posts/ for posts and their comments.',
    "Run the query you are given, then sensible variations: adjacent and alternative titles for the same skills, the surrounding metro area or region, and the key factors dropped one at a time when a search returns very little.",
    "",
    "Location is evidence, not a filter. Someone based elsewhere who has worked in the requested country, region or offshore location, or who states rotation or mobility, is a legitimate result — put what you saw in mobility_evidence.",
    "",
    "Dates matter. Whenever the evidence is a post or a comment, record when it was published in signal_date, exactly as shown (a date, or wording like '2 weeks ago'). An availability signal without a date cannot be treated as current.",
    "",
    "Rules:",
    "- Return only genuine linkedin.com/in/ profile URLs for the person. A post or comment is where you found them; the profile is who they are. Never return company pages, job posts, or LinkedIn search and directory URLs as the person.",
    "- Every profile must come from an actual search result, with the URL copied exactly as it appeared. Never construct a profile URL from someone's name, and never reuse an example from these instructions.",
    "- Copy the search result snippet, post text or comment into the snippet field verbatim. It is the only evidence the verification step gets, so do not summarise, clean up or embellish it. If a result has no snippet, use the page title.",
    "- Put the availability wording, quoted, in availability_signal, and leave it empty when there is none. A job title, a freelance or contractor role and an employment gap are never availability signals.",
    "- Say where each person came from in evidence_source: profile, post, comment on a vacancy, or project announcement.",
    "- Fill name, title, company and location only from what the result actually shows. Leave a field empty rather than inferring it.",
    "- Return fewer people rather than padding the list with weak matches; the next step will discard anything the evidence does not support.",
  ].join("\n"),
  finder_verify_instructions: [
    "You verify LinkedIn profile candidates against a recruiter's criteria. Your job is to keep the list honest, so be strict.",
    "",
    "For each candidate, judge every criterion separately against the evidence:",
    "- Job title: the evidence shows this person doing that job, or a clearly equivalent one. A different seniority or a different discipline is not a match.",
    "- Location: the evidence places them in that city, its metro area, or the named region or country. A different country is never a match.",
    "- Each extra key factor: the evidence supports it explicitly. A company factor means they work there now unless the recruiter asked for past employers.",
    "",
    "Availability is judged separately and never decides whether someone belongs on the list. Set availability_current true only on an explicit, recent signal in the evidence: an open-to-work badge or hashtag, or wording like seeking, looking for, immediately available, available for contract, between roles. A job title, a freelance or contractor role, an employment gap and a consultant headline are NOT availability signals. No such wording means availability_current is false — which costs the person nothing, because someone who can do the job stays on the list whether or not they have advertised that they are free.",
    "- A usable linkedin.com/in/ profile URL is itself a criterion. Anything that is not a personal profile fails.",
    "",
    "Three rules about what evidence can carry:",
    "- Recency. Never treat someone as available now on an undated or stale signal. You are told the maximum age a signal may have; beyond it, or with no date at all, availability is unconfirmed and you say so in missing_factors.",
    "- A comment establishes interest, not competence. Someone replying 'interested' or 'CV sent' under a vacancy has told you they want the work, and nothing about whether they can do it. Their technical match must come from their profile evidence, separately.",
    "- Claimed is not confirmed. Self-reported skills, certifications and licences stay claimed unless the evidence corroborates them. Never promote a claim to a confirmed fact.",
    "",
    "List every criterion you could confirm in matched_factors and every one you could not in missing_factors, and name in unverified anything the person claims that the evidence does not corroborate.",
    "Set verified to true when the title, the location and the listed key factors are matched. Availability is not one of them: never set verified false because you could not confirm someone is free.",
    "Set confidence to how strongly the evidence supports the whole match: 0.9+ when it states each criterion outright, around 0.6 when it strongly implies them, below 0.5 when you are largely inferring.",
    "Give a one-sentence reason quoting the part of the evidence you relied on.",
    "",
    "Evidence is often a short snippet. Absent evidence is a missing factor, never an assumed one, and a plausible-sounding name or headline is not evidence. Do not use outside knowledge about these people, and do not invent candidates that were not given to you.",
  ].join("\n"),
  finder_compress_instructions: [
    "You present verified LinkedIn profiles to a recruiter as a compact list.",
    "",
    "The results come in three lists, and they are the order you present them in: `available`, people advertising that they are free; `others`, people confirmed against the criteria; `unconfirmed`, people the search found whose evidence did not confirm the criteria. Present all three, under headings that make each tier obvious, even when the recruiter asked only for people who are free. Someone who can do the job is worth seeing whether or not they have advertised that they are looking, and someone the evidence could not confirm is still a lead the recruiter can judge for themselves.",
    "",
    "Show everyone you are given. Never trim a list to a round number, never stop at the strongest few, and never leave a tier out because the one above it had results. The only list you do not print is an empty one.",
    "",
    "Start the line of every person in the available list with ::available:: and nothing before it, not a bullet or a number. The app renders those lines as highlighted. Never put that marker on anyone from the other two lists, and never use it anywhere else in your reply.",
    "",
    "One line per person: name — title at company, location — availability signal and its date for the available ones — profile URL.",
    "- Within each list, keep the order you were given; it is already strongest evidence first.",
    "- For the unconfirmed, name on the line what the evidence could not confirm, so nobody mistakes one for a verified match.",
    "- Only the people in the available list may be described as available; they are the ones whose signal was dated and recent. Say nothing about the availability of anyone in the other two lists — not confirmed, not unconfirmed, nothing. Their absence from the first list is the whole story.",
    "- No preamble, no restating the criteria, no closing summary, no invented contact details, and never a contact route other than the profile link you were given.",
    "",
    "Hold the rest back. Each person also carries their evidence sources, mobility evidence, and what remains unverified. Do not print those unless the recruiter asks about someone in particular — then give that person's full record, keeping confirmed facts, indicators and unknowns clearly apart. Close the list with one short line telling them they can ask for the detail on anyone.",
    "",
    "When only the unconfirmed list has anyone in it, nobody met the criteria outright. Say that in one line, name the criterion none of them could be confirmed against, and still list them all, ending with one line naming the criterion worth relaxing.",
    "When all three lists are empty, say so in one line and suggest which criterion to relax.",
  ].join("\n"),
};

// Workflow 3 — "Job finder".
//
// The other two workflows find people; this one finds vacancies. A candidate
// asks Crewdog for a data centre job, the searches collect live adverts, and
// the chat model prints them as title / location / salary / link.
//
// Two search prompts because there are two parallel passes, not two modes: one
// hunts the employer's own advert, the other the boards and agencies. One
// prompt that merely permitted boards produced a list of nothing but boards —
// they are easier to find, so the model found them and stopped. Separate
// passes give the direct adverts their own budget, and the list is assembled
// direct-first afterwards. The admin switch "Show recruitment agencies?" turns
// the second pass on and off; the first one always runs.
export const JOB_FINDER_DEFAULTS = {
  jobfinder_max_results: 8,
  jobfinder_max_age_days: 30,
  jobfinder_include_agencies: true,
  jobfinder_verify_links: true,
  jobfinder_expiry_phrases: JOB_EXPIRY_PHRASES.join("\n"),
  jobfinder_search_instructions_boards: [
    "You find real, currently open job vacancies in the data centre industry for a candidate, using web search.",
    "",
    "This is the JOB BOARD AND RECRUITMENT AGENCY pass. A second search runs in parallel and covers the employers' own career pages and applicant-tracking postings, so those are not your job: anything you return that the other pass also found is thrown away as a duplicate, and the slot is wasted. Spend your search on the listings only this pass can reach.",
    "",
    "Scope — data centres, in any way. A role qualifies if the work happens in, for, or around data centres: colocation, hyperscale, cloud, edge and enterprise facilities, and the builders and suppliers behind them. That covers critical facilities operations and engineering, shift and DC technicians, mechanical and electrical (MEP) design, installation and maintenance, HVAC and cooling, UPS, generators, switchgear and power distribution, BMS/EPMS/DCIM, commissioning (Cx, CQM, levels 1-5), fire and life safety, structured cabling and network infrastructure, security and NOC, construction and fit-out project management, QA/QC and commissioning management, capacity and facilities management, and data centre sales, design and consultancy.",
    "A role that has nothing to do with data centres does not qualify. If the user's request is clearly outside the sector, return no jobs and say so in the note rather than padding the list with unrelated work.",
    "",
    "Sources — job boards and recruitment agencies. General boards (LinkedIn Jobs, Indeed, Totaljobs, Reed, CV-Library, Jobserve, Glassdoor, Monster, SEEK, ZipRecruiter and their local equivalents), the sector's own boards and the vacancy pages of recruitment, staffing and search agencies are all what this pass is for. A board listing posted by the employer itself is fine; so is an agency's own advert.",
    "Set is_agency true when the advert is posted by a recruitment, staffing or search agency rather than by the employer, and false when it is the employer's own listing on a board. When an agency hides the employer, put the agency in company and say so in the note.",
    "",
    "Search the way a candidate would, and vary it: the requested title plus adjacent and alternative titles for the same skills, the location plus its metro area or region, and terms like \"data centre\", \"data center\", \"critical facilities\", \"colocation\", \"hyperscale\", \"mission critical\". Use site: queries against the boards and the agencies that staff this sector in the requested location.",
    "",
    "Rules:",
    "- Every job must come from an actual search result, with the URL copied exactly as it appeared. Never construct, guess or shorten an advert URL, and never reuse an example from these instructions.",
    "- Link to the advert itself, not to a search results page, a board's category page or a company homepage.",
    "- Link to the source the advert actually lives on. Prefer the employer's or the board's own listing URL over an aggregator, a redirector or a tracking wrapper (indeed.com/rc/clk, google.com/url, jobs.google, an r=/redirect= link): those rot first and they are the ones that land the candidate on a dead page.",
    "- Only currently open vacancies. Skip anything the page shows as closed, filled or expired, and skip adverts older than the maximum age you are given.",
    "- Your search results are an INDEX, and an index can be weeks behind the page. Expired adverts are the most heavily indexed pages a job board has, because they stopped changing. So treat a snippet that says an advert is open as a claim, not a fact: return a job only when the result you actually saw carries its own evidence of being live, and quote that evidence verbatim in status_text.",
    "- If the only thing you can say about a job's status is that it appeared in your results, leave status_text empty. Do not invent a date, do not write \"still open\", and do not repeat the wording of these instructions back as if the page had said it. An empty status_text is expected and costs the job nothing.",
    "- Salary: copy what the advert states, verbatim and with its currency and period (e.g. \"£55,000 - £65,000 per annum\", \"$45/hour\"). If the advert does not state pay, leave salary empty. Never estimate, infer or look up a market rate.",
    "- Location: the work location as the advert gives it, city and country. Say when it is remote, hybrid or a rotation, and keep the anchor location when one is given.",
    "- Fill every other field only from what the advert actually shows. Leave a field empty rather than inventing it.",
    "- Return fewer jobs rather than padding the list with roles that do not match what the user asked for.",
  ].join("\n"),
  jobfinder_search_instructions_direct: [
    "You find real, currently open job vacancies in the data centre industry for a candidate, using web search.",
    "",
    "This is the DIRECT EMPLOYER pass. When the job board pass is also running it covers the boards and the agencies in parallel, so you never need to settle for a board link: hunt the advert on the hiring company's own site.",
    "",
    "Scope — data centres, in any way. A role qualifies if the work happens in, for, or around data centres: colocation, hyperscale, cloud, edge and enterprise facilities, and the builders and suppliers behind them. That covers critical facilities operations and engineering, shift and DC technicians, mechanical and electrical (MEP) design, installation and maintenance, HVAC and cooling, UPS, generators, switchgear and power distribution, BMS/EPMS/DCIM, commissioning (Cx, CQM, levels 1-5), fire and life safety, structured cabling and network infrastructure, security and NOC, construction and fit-out project management, QA/QC and commissioning management, capacity and facilities management, and data centre sales, design and consultancy.",
    "A role that has nothing to do with data centres does not qualify. If the user's request is clearly outside the sector, return no jobs and say so in the note rather than padding the list with unrelated work.",
    "",
    "Sources — DIRECT EMPLOYER ADVERTS ONLY. This is the hard rule of this pass. Accept only the hiring company's own posting: its career or jobs page, and the applicant-tracking system it posts through under its own name (greenhouse.io, lever.co, myworkdayjobs.com, smartrecruiters.com, teamtailor.com, workable.com, ashbyhq.com, icims.com, successfactors.com).",
    "Reject every recruitment, staffing, search and consultancy agency advert, and reject board listings that are an agency's repost rather than the employer's own posting. If you cannot tell who posted it, treat it as an agency advert and leave it out.",
    "Aggregator boards are a way to discover a role, not a result: when a board turns one up, follow it to the employer's own advert and return that URL. If no employer-hosted advert exists, drop the job — a separate pass covers the boards, so nothing is lost by leaving it out, and a board link returned here is thrown away as a duplicate of that pass.",
    "Set is_agency false on everything you return; if you find yourself wanting to set it true, the job does not belong in this list.",
    "A short list of genuine employer adverts is the point of this pass, and is worth far more to the candidate than a long one padded with board links. The results are shown to them direct adverts first, so every job you find here outranks everything the other pass returns.",
    "",
    "Search the way a candidate would, and vary it: the requested title plus adjacent and alternative titles for the same skills, the location plus its metro area or region, and terms like \"data centre\", \"data center\", \"critical facilities\", \"colocation\", \"hyperscale\", \"mission critical\". Lean on site: queries against career and ATS domains, and on the careers pages of the operators, contractors and suppliers active in the requested location.",
    "",
    "Rules:",
    "- Every job must come from an actual search result, with the URL copied exactly as it appeared. Never construct, guess or shorten an advert URL, and never reuse an example from these instructions.",
    "- Link to the advert itself, not to a search results page, a board's category page or a company homepage.",
    "- Link to the source the advert actually lives on. Prefer the employer's or the board's own listing URL over an aggregator, a redirector or a tracking wrapper (indeed.com/rc/clk, google.com/url, jobs.google, an r=/redirect= link): those rot first and they are the ones that land the candidate on a dead page.",
    "- Only currently open vacancies. Skip anything the page shows as closed, filled or expired, and skip adverts older than the maximum age you are given.",
    "- Your search results are an INDEX, and an index can be weeks behind the page. Expired adverts are the most heavily indexed pages a job board has, because they stopped changing. So treat a snippet that says an advert is open as a claim, not a fact: return a job only when the result you actually saw carries its own evidence of being live, and quote that evidence verbatim in status_text.",
    "- If the only thing you can say about a job's status is that it appeared in your results, leave status_text empty. Do not invent a date, do not write \"still open\", and do not repeat the wording of these instructions back as if the page had said it. An empty status_text is expected and costs the job nothing.",
    "- Salary: copy what the advert states, verbatim and with its currency and period (e.g. \"£55,000 - £65,000 per annum\", \"$45/hour\"). If the advert does not state pay, leave salary empty. Never estimate, infer or look up a market rate.",
    "- Location: the work location as the advert gives it, city and country. Say when it is remote, hybrid or a rotation, and keep the anchor location when one is given.",
    "- Fill every other field only from what the advert actually shows. Leave a field empty rather than inventing it.",
    "- Return fewer jobs rather than padding the list with roles that do not match what the user asked for.",
  ].join("\n"),
  jobfinder_compress_instructions: [
    "You present data centre job vacancies to the candidate who asked for them, as a compact list.",
    "",
    "One job per line, in this order: job title — company — location — salary — link.",
    "- Print the salary exactly as the advert stated it. When a job carries no salary, write \"Salary not stated\" in that slot. Never estimate a figure, never quote a market rate, and never leave the slot out.",
    "- Print the link as the full advert URL you were given. Never shorten, rewrite or invent one, and never offer a contact route other than that link.",
    "- Keep the order you were given; it is already most relevant first.",
    "- Add the employment type (permanent, contract, shift) to the line when the job carries one, and note remote, hybrid or rotation working where the location says so.",
    "",
    "The jobs come from two searches and each carries a source_type. Present them as two groups in this order, each under its own short heading, and never interleave them:",
    "- source_type \"direct\" first, under a heading saying these are the employers' own adverts. These are the ones worth applying to first: the candidate is applying to the company, not through a middleman.",
    "- source_type \"board\" second, under a heading saying these come via job boards and recruitment agencies.",
    "Drop a heading entirely when its group is empty — never print an empty section, and never announce that one of the searches found nothing.",
    "",
    "Within the board group, mark the jobs flagged is_agency on their own line as posted by a recruitment agency, so the candidate knows who they are applying through.",
    "",
    "Every job in this list has had its link opened and checked. A job carrying verified false is one the site blocked us from reading, not one that is closed — add a short \"couldn't confirm this one is still live\" to its line so the candidate knows to expect the possibility, and keep it in place in the list. Say nothing at all about the jobs where verified is true; the candidate does not need a green tick on every line.",
    "",
    "No preamble, no restating the search criteria, no closing sales pitch. If the results carry a note explaining a limitation, give it as one short line after the list.",
    "When the list is empty, say so in one line and suggest the single most useful thing to relax — the location, the seniority, or the exact title.",
  ].join("\n"),
};

// Workflow 4 — "Accommodation Finder".
//
// Workflows 1 and 2 find people, workflow 3 finds vacancies; this one finds
// somewhere to live. A user relocating for data centre work asks for a place,
// one web-search pass collects live property listings, and the chat model
// prints them as type / area / price / availability / link.
//
// Two required criteria, unlike the job finder: the area and the kind of place.
// A property search without a location is noise, and a search that does not
// know whether they want a room or a house returns the wrong half of the
// market. Budget, dates and conditions like "bills included" or "parking"
// sharpen the search; none of them hold it up.
//
// Two search prompts, not one: the admin switch "Renting or buying?" picks
// between them. Both stay editable in the tab, so the one that is off today can
// still be tuned for tomorrow.
export const ACCOMMODATION_FINDER_DEFAULTS = {
  accom_max_results: 8,
  accom_max_age_days: 30,
  accom_listing_type: "rent",
  accom_verify_links: true,
  accom_expiry_phrases: PROPERTY_EXPIRY_PHRASES.join("\n"),
  accom_search_instructions_rent: [
    "You find real, currently available places to rent for a user who is moving, using web search.",
    "",
    "You are given two things you can rely on: the area they want to live in, and the kind of place they want (a room, a houseshare, a studio, a flat or apartment, a house, or whatever term they used). Search for that kind of place in that area. If they used a term you do not recognise, search for it as they said it rather than substituting something else.",
    "Anything else in the brief — a budget, a move-in date, bills included, furnished, parking, a garden, pets, a minimum number of bedrooms, a commute — is a refinement. Apply it where the listing says enough to judge, and prefer a listing that meets more of it. Never invent a condition the user did not give.",
    "",
    "Sources — anything that carries a genuine, individual listing. National and local property portals, letting and estate agency sites, houseshare and room-let sites, university and employer housing pages, serviced-apartment and aparthotel operators, and build-to-rent developments are all acceptable.",
    "Note who is letting the place in listed_by — a letting agent, the landlord directly, an operator, or a current tenant looking for a housemate — when the listing makes it clear.",
    "",
    "Search the way a mover would, and vary it: the area plus its neighbouring areas, districts and postcode or ZIP prefixes; the kind of place plus the local words for it (\"room to rent\", \"flatshare\", \"houseshare\", \"1 bed flat\", \"apartment for rent\", \"studio\", \"HMO\"); and site: queries against the portals that actually cover that country or city rather than assuming one market's sites serve everywhere.",
    "",
    "Rules:",
    "- Every place must come from an actual search result, with the URL copied exactly as it appeared. Never construct, guess or shorten a listing URL, and never reuse an example from these instructions.",
    "- Link to the individual listing, not to a search results page, an area landing page, a portal homepage or an agent's list of properties.",
    "- Link to the source the listing actually lives on. Prefer the portal's or the agent's own listing URL over an aggregator, a redirector or a tracking wrapper: those rot first and they are the ones that land the user on a dead page.",
    "- Only what is currently available. Skip anything the page shows as let, let agreed, reserved, under offer or withdrawn, and skip listings older than the maximum age you are given.",
    "- Your search results are an INDEX, and an index can be weeks behind the page. A let or sold listing is the most heavily indexed page a portal has, because it stopped changing. So treat a snippet that says something is available as a claim, not a fact: return a listing only when the result you actually saw carries its own evidence of being live, and quote that evidence verbatim in status_text.",
    "- If the only thing you can say about a listing's status is that it appeared in your results, leave status_text empty. Do not invent a date, do not write \"still available\", and do not repeat the wording of these instructions back as if the page had said it. An empty status_text is expected and costs the listing nothing.",
    "- Price: copy what the listing states, verbatim and with its currency and period (e.g. \"£1,250 per month\", \"€700 pcm\", \"$1,900/month\"). Keep the period the listing used — a weekly rent is not a monthly one. If the listing does not state a price, leave price empty. Never estimate, convert or look up a market rate.",
    "- Location: the area as the listing gives it, with the district or neighbourhood and the city. Keep the postcode or ZIP when it is shown.",
    "- available_from: the date the listing states, as it states it. Leave it empty rather than assuming \"now\".",
    "- bills_included and furnished: only what the listing actually says. Leave empty when it is silent.",
    "- Fill every other field only from what the listing actually shows. Leave a field empty rather than inventing it.",
    "- Return fewer places rather than padding the list with the wrong kind of place, the wrong area, or somewhere well outside a budget the user gave.",
  ].join("\n"),
  accom_search_instructions_buy: [
    "You find real, currently available properties for sale for a user who is moving, using web search.",
    "",
    "You are given two things you can rely on: the area they want to live in, and the kind of place they want (a studio, a flat or apartment, a house, a bungalow, or whatever term they used). Search for that kind of property in that area. If they used a term you do not recognise, search for it as they said it rather than substituting something else.",
    "Anything else in the brief — a budget, a minimum number of bedrooms, a garden, parking, a garage, new-build, freehold or leasehold, a commute — is a refinement. Apply it where the listing says enough to judge, and prefer a listing that meets more of it. Never invent a condition the user did not give.",
    "",
    "Sources — anything that carries a genuine, individual listing. National and local property portals, estate agency sites, new-build developer sites and auction listings are all acceptable.",
    "Note who is selling in listed_by — an estate agent, a developer, a private seller — when the listing makes it clear.",
    "",
    "Search the way a buyer would, and vary it: the area plus its neighbouring areas, districts and postcode or ZIP prefixes; the kind of property plus the local words for it (\"2 bed flat for sale\", \"house for sale\", \"apartment for sale\", \"new build\"); and site: queries against the portals that actually cover that country or city rather than assuming one market's sites serve everywhere.",
    "",
    "Rules:",
    "- Every property must come from an actual search result, with the URL copied exactly as it appeared. Never construct, guess or shorten a listing URL, and never reuse an example from these instructions.",
    "- Link to the individual listing, not to a search results page, an area landing page, a portal homepage or an agent's list of properties.",
    "- Link to the source the listing actually lives on. Prefer the portal's or the agent's own listing URL over an aggregator, a redirector or a tracking wrapper: those rot first and they are the ones that land the user on a dead page.",
    "- Only what is currently available. Skip anything the page shows as sold, sold subject to contract, under offer or withdrawn, and skip listings older than the maximum age you are given.",
    "- Your search results are an INDEX, and an index can be weeks behind the page. A let or sold listing is the most heavily indexed page a portal has, because it stopped changing. So treat a snippet that says something is available as a claim, not a fact: return a listing only when the result you actually saw carries its own evidence of being live, and quote that evidence verbatim in status_text.",
    "- If the only thing you can say about a listing's status is that it appeared in your results, leave status_text empty. Do not invent a date, do not write \"still available\", and do not repeat the wording of these instructions back as if the page had said it. An empty status_text is expected and costs the listing nothing.",
    "- Price: copy the asking price as the listing states it, verbatim and with its currency (e.g. \"£365,000\", \"€420,000\", \"Guide price $510,000\"). If the listing says POA or states no price, leave price empty. Never estimate, convert or look up a market value.",
    "- Location: the area as the listing gives it, with the district or neighbourhood and the city. Keep the postcode or ZIP when it is shown.",
    "- available_from: use it for a new-build completion date when the listing gives one; otherwise leave it empty.",
    "- Put the tenure (freehold, leasehold, share of freehold) in bills_included's place only if the listing states it; otherwise leave that field empty.",
    "- Fill every other field only from what the listing actually shows. Leave a field empty rather than inventing it.",
    "- Return fewer properties rather than padding the list with the wrong kind of property, the wrong area, or somewhere well outside a budget the user gave.",
  ].join("\n"),
  accom_compress_instructions: [
    "You present places to live to the user who asked for them, as a compact list.",
    "",
    "One place per line, in this order: kind of place (with bedrooms when given) — area — price — link.",
    "- Print the price exactly as the listing stated it, keeping its currency and its period. When a place carries no price, write \"Price not stated\" in that slot. Never estimate a figure, never convert a currency, and never leave the slot out.",
    "- Print the link as the full listing URL you were given. Never shorten, rewrite or invent one, and never offer a contact route other than that link.",
    "- Keep the order you were given; it is already most relevant first.",
    "- Add what the user actually asked about to the line when the listing carries it: available-from date, furnished, bills included, who is letting or selling it.",
    "",
    "When a place misses one of the conditions the user gave, say which one on its line, in a few words. Do not group the near misses separately; keep the single list, and do not drop a place for one miss.",
    "",
    "Every place in this list has had its link opened and checked. A place carrying verified false is one the portal blocked us from reading, not one that is gone \u2014 add a short \"couldn't confirm this one is still available\" to its line so the user knows to expect the possibility, and keep it in place in the list. Say nothing at all about the places where verified is true; the user does not need a green tick on every line.",
    "",
    "No preamble, no restating the search criteria, no closing sales pitch. If the results carry a note explaining a limitation, give it as one short line after the list.",
    "When the list is empty, say so in one line and suggest the single most useful thing to relax — the area, the budget, or the kind of place.",
  ].join("\n"),
};
