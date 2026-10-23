// cv_reader — turns an uploaded CV into a stored document and a filled profile.
//
// Three steps, in this order, because each needs the one before it: read the
// text out of the PDF, ask the model what the person's details are, then put
// the file in storage and the details in the database.
//
// The PDF step lives here rather than in server.js because /api/extract-cv (the
// chat composer's attach button) needs the same thing, and two copies of a
// signature check and a page-marker regex is one copy too many.
//
// Reads and writes go through the Supabase REST API with the anon key and the
// caller's own bearer token, the way proSkills.js and usage.js reach their
// tables. The row and object policies in 20261023000000_cv_profile.sql are
// owner-scoped, so the user's token is the authorisation and there is no
// service-role key in this path at all.

import { PDFParse } from "pdf-parse";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

// Extraction is a cheap, bounded job — pull eight fields out of a few thousand
// words — so it does not ride on OPENAI_MODEL, which is tuned for the chat.
const CV_READER_MODEL = "gpt-4o-mini";

// 10MB, matching the limit /api/extract-cv has always enforced. Bodies are
// base64 inside a 15mb JSON limit (server.js), so this is the real ceiling.
const MAX_BYTES = 10 * 1024 * 1024;

// The eight profile fields, in the order the form shows them. Everything that
// walks a profile — the JSON schema, the merge, the row written to Supabase —
// walks this list, so adding a field is one edit here.
export const PROFILE_FIELDS = [
  "full_name",
  "email",
  "phone",
  "location",
  "summary",
  "job_title_1",
  "job_title_2",
  "job_title_3",
];

export class CvReaderError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = "CvReaderError";
    this.status = status;
  }
}

// Decodes a base64 payload (with or without a data: URL prefix) and checks it
// is a PDF of a sane size before anything expensive touches it.
export function decodePdf(dataBase64) {
  const b64 = dataBase64.includes(",") ? dataBase64.split(",").pop() : dataBase64;
  let buf;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    throw new CvReaderError("Invalid base64 data", 400);
  }
  if (buf.length > MAX_BYTES) {
    throw new CvReaderError("File too large (max 10MB)", 413);
  }
  if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new CvReaderError("Only PDF files are supported", 400);
  }
  return buf;
}

// The plain text of a PDF, cleaned up enough to feed to a model or a prompt.
export async function pdfToText(buf) {
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  let text = "";
  try {
    const result = await parser.getText();
    text = String(result?.text ?? "");
  } finally {
    await parser.destroy?.();
  }

  // Drop pdf-parse page markers like "-- 1 of 3 --" and collapse blank runs.
  text = text
    .replace(/^-- \d+ of \d+ --$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!text) {
    throw new CvReaderError("Couldn't read any text from this PDF.", 422);
  }
  return text;
}

const EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: PROFILE_FIELDS,
  properties: {
    full_name: { type: "string" },
    email: { type: "string" },
    phone: { type: "string" },
    location: { type: "string" },
    summary: { type: "string" },
    job_title_1: { type: "string" },
    job_title_2: { type: "string" },
    job_title_3: { type: "string" },
  },
};

const EXTRACT_PROMPT = `You read a CV and return the candidate's details as JSON.

Rules:
- Use only what the CV says. If a field is not in the CV, return an empty string for it. Never guess, never invent a plausible value.
- full_name: the candidate's own name, as written.
- email / phone: the candidate's contact details. Phone keeps its country code if the CV has one.
- location: where the candidate is based — city and country if both are given. Not an employer's address.
- summary: if the CV has a personal summary, profile or objective section, return it verbatim (trimmed). Only if it has none, write 2-3 sentences of your own summarising their experience, seniority and field.
- job_title_1, job_title_2, job_title_3: the job titles of their three most recent roles, most recent first. Titles only — no employer, no dates. Fewer than three roles means empty strings for the rest.`;

// One model call, returning the eight fields. Anything the model leaves out, or
// any malformed answer, degrades to empty strings rather than failing the
// upload: the file is still worth storing and the user can type the rest.
export async function extractCvFields(openai, text) {
  // A CV runs to a few pages; the cap is there for the pathological 40-page
  // academic one, where the first 20k characters hold everything we want.
  const body = text.slice(0, 20000);

  const completion = await openai.chat.completions.create({
    model: CV_READER_MODEL,
    temperature: 0,
    messages: [
      { role: "system", content: EXTRACT_PROMPT },
      { role: "user", content: body },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "cv_fields", strict: true, schema: EXTRACT_SCHEMA },
    },
  });

  let parsed = {};
  try {
    parsed = JSON.parse(completion.choices?.[0]?.message?.content || "{}");
  } catch {
    parsed = {};
  }

  const fields = {};
  for (const key of PROFILE_FIELDS) {
    fields[key] = typeof parsed[key] === "string" ? parsed[key].trim() : "";
  }
  return fields;
}

function restHeaders(accessToken, extra = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new CvReaderError("Supabase is not configured", 500);
  }
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
    ...extra,
  };
}

// The caller's current profile row, or null when they have never saved one.
export async function readProfile(accessToken, userId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${userId}&select=*`,
    { headers: restHeaders(accessToken, { Accept: "application/json" }) }
  );
  if (!res.ok) {
    throw new CvReaderError(`Could not read your profile (${res.status})`, 502);
  }
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function upsert(accessToken, table, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: restHeaders(accessToken, {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
      Accept: "application/json",
    }),
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    throw new CvReaderError(
      `Could not save to ${table} (${res.status}: ${await res.text()})`,
      502
    );
  }
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : row;
}

// Stores the PDF and the fields read out of it.
//
// The merge is deliberately one-directional: a value the user already has wins
// over the CV. Uploading a second CV therefore cannot silently undo a
// correction someone made by hand — it only fills in what is still blank.
export async function storeCv({ accessToken, userId, buffer, filename, fields }) {
  const path = `${userId}/cv.pdf`;

  const upload = await fetch(
    `${SUPABASE_URL}/storage/v1/object/cvs/${encodeURI(path)}`,
    {
      method: "POST",
      headers: restHeaders(accessToken, {
        "Content-Type": "application/pdf",
        // The path is fixed per user, so every upload after the first is a
        // replacement. Without this the second one is a 409.
        "x-upsert": "true",
      }),
      body: buffer,
    }
  );
  if (!upload.ok) {
    throw new CvReaderError(
      `Could not store your CV (${upload.status}: ${await upload.text()})`,
      502
    );
  }

  const existing = await readProfile(accessToken, userId);
  const merged = { user_id: userId };
  for (const key of PROFILE_FIELDS) {
    const current = typeof existing?.[key] === "string" ? existing[key].trim() : "";
    merged[key] = current || fields[key] || "";
  }
  merged.updated_at = new Date().toISOString();

  const [cv, profile] = await Promise.all([
    upsert(accessToken, "user_cvs", {
      user_id: userId,
      file_path: path,
      file_name: filename,
      extracted_name: fields.full_name || null,
      uploaded_at: new Date().toISOString(),
    }),
    upsert(accessToken, "user_profiles", merged),
  ]);

  return { cv, profile };
}
