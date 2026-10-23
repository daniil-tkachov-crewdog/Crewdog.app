// server/functions/date/today.js
//
// Today's date as the prompts want to quote it. Every workflow run gets it as
// a placeholder so the model can reason about how recent a posting is.

/**
 * @returns {string} Today in UTC as YYYY-MM-DD.
 */
export function today() {
  return new Date().toISOString().slice(0, 10);
}
