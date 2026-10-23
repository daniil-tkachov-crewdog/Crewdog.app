// server/functions/openai/outputText.js
//
// Pulls the assistant text out of a Responses API result.

/**
 * @param {object} resp  A Responses API result.
 * @returns {string}     The text, or "" when the model returned none (a
 *                       tool-only turn, or a refusal).
 */
export function outputText(resp) {
  return resp?.output_text ?? "";
}
