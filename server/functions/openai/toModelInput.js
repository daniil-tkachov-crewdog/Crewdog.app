// server/functions/openai/toModelInput.js
//
// Converts the chat history the browser sends into the shape the Responses
// API expects. Both chat modes send the same history; only what rides
// alongside it (tools, instructions, output format) differs.

/**
 * Normalise a message list for the Responses API.
 *
 * Any role that is not "assistant" becomes "user" — the API accepts only
 * those two here, and the system prompt travels in `instructions`, not in the
 * history, so a stray "system" row from the client must not be forwarded as
 * one.
 *
 * @param {Array<{role?: string, content?: unknown}>} messages
 * @returns {Array<{role: "user"|"assistant", content: string}>}
 */
export function toModelInput(messages) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content ?? ""),
  }));
}
