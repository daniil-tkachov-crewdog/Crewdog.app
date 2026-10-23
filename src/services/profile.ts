// The user's profile and the CV it was read from.
//
// Two different doors into the same two tables, on purpose. Reads and the
// manual Save go straight to Supabase from the browser, because RLS already
// limits a user to their own row and a server hop would add nothing. The upload
// goes through /api/cv-reader instead: that one needs the OpenAI key, which
// never leaves the server.

import { supabase, getAccessToken } from "@/lib/supabase";

export type ProfileFields = {
  full_name: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  job_title_1: string;
  job_title_2: string;
  job_title_3: string;
};

export type CvRecord = {
  file_path: string;
  file_name: string;
  extracted_name: string | null;
  uploaded_at: string;
};

export const EMPTY_PROFILE: ProfileFields = {
  full_name: "",
  email: "",
  phone: "",
  location: "",
  summary: "",
  job_title_1: "",
  job_title_2: "",
  job_title_3: "",
};

// Keeps a row from the database down to the fields the form binds to, and
// turns every null into "" so the inputs stay controlled.
function toFields(row: Partial<Record<keyof ProfileFields, unknown>> | null): ProfileFields {
  const out = { ...EMPTY_PROFILE };
  if (!row) return out;
  for (const key of Object.keys(EMPTY_PROFILE) as (keyof ProfileFields)[]) {
    const value = row[key];
    out[key] = typeof value === "string" ? value : "";
  }
  return out;
}

export async function getProfile(): Promise<ProfileFields | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toFields(data) : null;
}

export async function getCurrentCv(): Promise<CvRecord | null> {
  const { data, error } = await supabase
    .from("user_cvs")
    .select("file_path,file_name,extracted_name,uploaded_at")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CvRecord) ?? null;
}

export async function saveProfile(fields: ProfileFields): Promise<ProfileFields> {
  const { data: { user } = { user: null } } = await supabase.auth.getUser();
  if (!user) throw new Error("You need to be logged in to save your profile.");

  const { data, error } = await supabase
    .from("user_profiles")
    .upsert(
      { user_id: user.id, ...fields, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toFields(data);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

export const MAX_CV_BYTES = 10 * 1024 * 1024;

// Runs cv_reader: uploads the PDF and gets back the stored CV plus the profile
// as it now stands, with the extracted values filled into the empty fields.
export async function uploadCv(
  file: File
): Promise<{ cv: CvRecord; profile: ProfileFields }> {
  if (file.type && file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
    throw new Error("Only PDF files are supported.");
  }
  if (file.size > MAX_CV_BYTES) {
    throw new Error("That file is over 10MB.");
  }

  const token = await getAccessToken();
  if (!token) throw new Error("You need to be logged in to upload a CV.");

  const dataBase64 = await fileToBase64(file);
  const res = await fetch("/api/cv-reader", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ dataBase64, filename: file.name }),
  });
  if (!res.ok) {
    let msg = "Could not read your CV.";
    try {
      const d = await res.json();
      msg = d?.error || msg;
    } catch {
      /* non-JSON */
    }
    throw new Error(msg);
  }
  const data = await res.json();
  return { cv: data.cv as CvRecord, profile: toFields(data.profile) };
}
