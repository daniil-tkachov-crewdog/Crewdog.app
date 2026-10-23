// server/functions/openai/mimeToExtension.js
//
// Maps a recording's mime type back to a filename extension for the
// transcription API.

// MediaRecorder's container varies by browser — webm/opus on Chrome and
// Firefox, mp4/aac on Safari — and OpenAI picks its decoder from the
// filename, so the type has to survive the trip as an extension.
const AUDIO_EXTENSIONS = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

/**
 * Pick a filename extension for an audio mime type.
 *
 * Parameters after the type ("audio/webm;codecs=opus") are stripped before
 * lookup. Anything unrecognised falls back to webm, which is what every
 * browser but Safari records in.
 *
 * @param {unknown} mimeType  The browser's reported type; may be absent.
 * @returns {string}          An extension with no leading dot.
 */
export function mimeToExtension(mimeType) {
  const type = String(mimeType || "").split(";")[0].trim().toLowerCase();
  return AUDIO_EXTENSIONS[type] || "webm";
}
