// src/services/contactLookup.ts
import { apiUrl } from "@/lib/config";
import { getAccessToken } from "@/lib/supabase";

export type ContactField = "phone" | "email";

/**
 * What one reveal came back with. `cached` means the answer was already paid
 * for, which the UI says out loud so a click never looks like it cost money
 * when it did not.
 */
export type ContactLookupResult =
  | { status: "success"; values: string[]; cached: boolean }
  | { status: "not_found"; cached: boolean }
  | { status: "disabled"; message: string }
  | { status: "error"; message: string };

const GENERIC_ERROR = "Couldn't check this one — please try again.";

const asList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];

/**
 * Ask our own backend to reveal one contact datapoint for one LinkedIn profile.
 *
 * Deliberately goes to /api/contact-lookup and not to Lusha: the key is
 * server-only, and the server owns the kill switch, the cache and the
 * signed-in check. This function's only job is to carry the user's session so
 * that check can happen.
 *
 * Always resolves — never throws — so the button's spinner cannot be left
 * spinning by a network or parse failure.
 */
export async function lookupContactField(
  linkedinUrl: string,
  field: ContactField
): Promise<ContactLookupResult> {
  try {
    const token = await getAccessToken();
    if (!token) {
      return { status: "error", message: "Please sign in to check contact details." };
    }

    const resp = await fetch(apiUrl("/contact-lookup"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ linkedinUrl, field }),
    });

    let parsed: unknown = null;
    try {
      parsed = await resp.json();
    } catch {
      // Fall through: an empty or non-JSON body is handled as a generic error.
    }
    const body = (parsed ?? {}) as Record<string, unknown>;
    const message = String(body.message ?? "").trim();

    switch (body.status) {
      case "success": {
        const values = asList(field === "email" ? body.emails : body.phones);
        // A "success" with nothing in it is a miss, whatever the server called
        // it — the UI should never render an empty result list.
        return values.length
          ? { status: "success", values, cached: !!body.cached }
          : { status: "not_found", cached: !!body.cached };
      }
      case "not_found":
        return { status: "not_found", cached: !!body.cached };
      case "disabled":
        return { status: "disabled", message: message || "Contact lookup is off." };
      default:
        return { status: "error", message: message || GENERIC_ERROR };
    }
  } catch {
    return { status: "error", message: GENERIC_ERROR };
  }
}
