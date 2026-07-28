// src/services/contactDetails.ts
import { N8N_CONTACT_DETAILS_WEBHOOK } from "@/lib/config";

/** Result of looking up a person's contact details via the n8n webhook. */
export type ContactDetailsResult =
  | { status: "success"; phone: string }
  | { status: "error"; message: string };

const DEFAULT_ERROR =
  "It looks like we don't have any contact details of this person";

/**
 * POST a person's LinkedIn URL to the n8n contact-details webhook and normalize
 * the response.
 *
 * The webhook replies with one of two shapes:
 *   success → { "Phone_number": "..." }
 *   error   → { "False": "It looks like we don't have any contact details..." }
 *
 * We detect the outcome by key presence and always resolve (never throw) so the
 * UI spinner can't hang on a network/parse failure.
 */
export async function lookupContactDetails(
  linkedInUrl: string
): Promise<ContactDetailsResult> {
  try {
    const resp = await fetch(N8N_CONTACT_DETAILS_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ LinkedIn_url: linkedInUrl }),
    });

    // Tolerate JSON or text; n8n often wraps the payload in an array.
    let parsed: unknown;
    const ct = (resp.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) {
      parsed = await resp.json();
    } else {
      const text = await resp.text();
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }
    }
    if (Array.isArray(parsed)) parsed = parsed[0] ?? {};

    const data =
      parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : {};

    if (data.Phone_number != null && String(data.Phone_number).trim()) {
      return { status: "success", phone: String(data.Phone_number).trim() };
    }

    if (data.False != null) {
      const message = String(data.False).trim() || DEFAULT_ERROR;
      return { status: "error", message };
    }

    return { status: "error", message: DEFAULT_ERROR };
  } catch {
    return { status: "error", message: DEFAULT_ERROR };
  }
}
