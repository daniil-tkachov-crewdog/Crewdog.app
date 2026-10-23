// server/functions/openai/buildProFormat.js
//
// Builds Pro mode's `text.format` from the JSON Schema saved in the admin
// panel.

import { PRO_SCHEMA_DEFAULT } from "../../proSchema.js";

/**
 * Turn a saved schema into a Responses API `text.format` object.
 *
 * A bad paste in the admin panel must not take Pro mode down, so an
 * unparseable or structurally wrong schema falls back to the built-in default
 * — the same fail-safe the tool-argument prompts use. Returning something is
 * the point: with no format at all Pro mode answers in prose and renders no
 * cards.
 *
 * @param {string|object|undefined} raw  The admin's schema, as JSON text or an
 *                                       already-parsed object.
 * @returns {{type: "json_schema", name: string, strict: boolean, schema: object}
 *          | undefined}
 *          Undefined only if the built-in default is itself unusable, which
 *          would be a bug in proSchema.js rather than bad input.
 */
export function buildProFormat(raw) {
  for (const src of [raw, PRO_SCHEMA_DEFAULT]) {
    try {
      const parsed = typeof src === "string" ? JSON.parse(src) : src;
      if (parsed?.schema?.type !== "object") continue;
      // The API only accepts [a-zA-Z0-9_-] here, and the name is a label, so a
      // sanitised one is better than a 400 on an otherwise valid schema.
      const name =
        String(parsed.name ?? "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) ||
        "crewdog_pro_search";
      return {
        type: "json_schema",
        name,
        strict: parsed.strict !== false,
        schema: parsed.schema,
      };
    } catch {
      /* try the default next */
    }
  }
}
