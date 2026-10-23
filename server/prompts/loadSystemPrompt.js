// server/prompts/loadSystemPrompt.js
//
// Reads the core system prompt off disk.

import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Read server/prompts/system.md.
 *
 * It lives on disk, beside this file, so it can be edited without touching
 * code. A missing or unreadable file yields "" rather than throwing: the
 * admin panel's system_prompt overrides it anyway, and an unreadable file
 * must not take chat down.
 *
 * Deliberately not cached — the file is small, and re-reading means an edit
 * on the box takes effect without a restart.
 *
 * @returns {string} The prompt, trimmed, or "".
 */
export function loadSystemPrompt() {
  try {
    return readFileSync(path.join(__dirname, "system.md"), "utf8").trim();
  } catch {
    return "";
  }
}
