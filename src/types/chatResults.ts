// Workflow results the chat API returns beside the reply text (see
// chatResults.js on the server). Rendered as unfolding cards.

export type SummaryStep = [label: string, text: string];

export type ResultSummary = {
  label: string;
  steps: SummaryStep[];
};

export type PersonResult = {
  name: string;
  title: string;
  company: string;
  location: string;
  url: string;
  // How strong the evidence is, in the order the list is ranked: advertising
  // they are free, confirmed against the criteria, or found but unproven.
  tier?: "available" | "match" | "unconfirmed";
  available?: boolean;
  signal?: string;
  signal_source?: string;
  signal_date?: string;
  matched?: string[];
  // Criteria the evidence could not confirm (tier "unconfirmed").
  unconfirmed?: string[];
  confidence?: number;
  routes?: string[];
  // Workflow 1 contacts: "HR" or "Connection".
  tag?: string;
};

export type JobResult = {
  title: string;
  company: string;
  location: string;
  salary: string;
  status_text: string;
  employment_type: string;
  posted_date: string;
  source: string;
  url: string;
  is_agency: boolean;
  verified: boolean | null;
  // Which search found it: the employer's own advert, or a board/agency
  // listing. The cards show the two as separate sections, direct first.
  source_type?: "direct" | "board";
};

export type PlaceResult = {
  title: string;
  location: string;
  price: string;
  bills: string;
  available_from: string;
  status_text: string;
  furnished: string;
  listed_by: string;
  source: string;
  url: string;
  matches: string[];
  misses: string[];
};

export type ResultGroup =
  | { kind: "people"; items: PersonResult[]; summary: ResultSummary }
  | { kind: "jobs"; items: JobResult[]; summary: ResultSummary }
  | { kind: "places"; items: PlaceResult[]; summary: ResultSummary };

// Where the cards sit in the reply text; the model writes it on its own line.
export const CARDS_MARKER = "::cards::";

// Where the model's suggested next prompts sit, after the reply text. Each line
// below the marker is one suggestion, rendered as a button under the answer.
export const SUGGESTIONS_MARKER = "::next::";
