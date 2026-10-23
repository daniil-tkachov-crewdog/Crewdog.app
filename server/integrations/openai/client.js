// server/integrations/openai/client.js
//
// The single OpenAI client the whole API shares, plus the model names that
// go with it.
//
// The key is read from the environment here and nowhere else, and this module
// is never imported by anything under client/ — that is what keeps it off the
// browser bundle.

import OpenAI from "openai";

/**
 * Shared client. Constructed at import time, which means a missing
 * OPENAI_API_KEY fails the boot rather than the first request — the loud
 * failure is the useful one.
 */
export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** Chat model used when the request does not name one. */
export const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o";

/**
 * Speech-to-text model for the composer's microphone button. Same API key as
 * the chat; overridable without a deploy if a cheaper model is wanted.
 */
export const TRANSCRIBE_MODEL =
  process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe";
