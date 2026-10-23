// server/functions/openai/addUsage.js
//
// Folds one Responses API result's token usage into a running total.

/**
 * Add a response's usage to an accumulator, in place.
 *
 * `requests` counts the OpenAI calls themselves, so a turn can be reconciled
 * against the request count on the OpenAI dashboard.
 *
 * @param {{input_tokens:number, output_tokens:number, total_tokens:number,
 *          requests:number}} acc  Mutated.
 * @param {object} resp
 */
export function addUsage(acc, resp) {
  const u = resp?.usage ?? {};
  acc.input_tokens += u.input_tokens ?? 0;
  acc.output_tokens += u.output_tokens ?? 0;
  acc.total_tokens += u.total_tokens ?? 0;
  acc.requests += 1;
}
