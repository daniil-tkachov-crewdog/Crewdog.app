// server/routes/transcribe.route.js
//
// POST /api/transcribe — turns a composer recording into text so the frontend
// can send it as an ordinary chat message.

import { Router } from "express";
import { toFile } from "openai";
import { openai, TRANSCRIBE_MODEL } from "../integrations/openai/client.js";
import { mimeToExtension } from "../functions/openai/mimeToExtension.js";

export const transcribeRoute = Router();

/** 10 MB of audio is minutes of speech. The JSON body cap is 15 MB and base64
 *  inflates by a third, so this is the real ceiling either way. */
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/transcribe  { audioBase64, mimeType? }
 * → { text, model }
 *
 * The browser hands over whatever container MediaRecorder gave it (webm/opus
 * on Chrome and Firefox, mp4/aac on Safari), base64-encoded through the
 * existing JSON body parser rather than as multipart — the same route the CV
 * upload takes, so no new middleware is involved.
 */
transcribeRoute.post("/transcribe", async (req, res) => {
  try {
    // Transcription costs money per call, so it needs an identity behind it,
    // exactly like /api/chat. The usage meter counts chat tokens only, so this
    // gate is the whole of the cost control here.
    if (!req.userId) {
      return res
        .status(401)
        .json({ error: "Log in to use voice input.", code: "auth_required" });
    }

    const { audioBase64, mimeType } = req.body ?? {};
    if (typeof audioBase64 !== "string" || !audioBase64) {
      return res.status(400).json({ error: "audioBase64 is required" });
    }

    // Strip an optional data: URL prefix (e.g. "data:audio/webm;base64,").
    const b64 = audioBase64.includes(",")
      ? audioBase64.split(",").pop()
      : audioBase64;
    let buf;
    try {
      buf = Buffer.from(b64, "base64");
    } catch {
      return res.status(400).json({ error: "Invalid base64 data" });
    }
    if (!buf.length) return res.status(400).json({ error: "Empty recording" });
    if (buf.length > MAX_AUDIO_BYTES) {
      return res.status(413).json({ error: "Recording too long (max 10MB)" });
    }

    // OpenAI picks the decoder from the filename extension, so the container
    // the browser recorded in has to survive the trip.
    const type = String(mimeType || "").split(";")[0].trim().toLowerCase();
    const file = await toFile(buf, `voice.${mimeToExtension(mimeType)}`, {
      type: type || "audio/webm",
    });

    const result = await openai.audio.transcriptions.create({
      file,
      model: TRANSCRIBE_MODEL,
    });
    const text = String(result?.text ?? "").trim();
    // Silence and background noise both come back empty. Saying so is better
    // than sending an empty prompt to the chat model.
    if (!text) {
      return res.status(422).json({ error: "Didn't catch any speech." });
    }
    res.json({ text, model: TRANSCRIBE_MODEL });
  } catch (err) {
    console.error("[/api/transcribe]", err?.message || err);
    res.status(500).json({ error: "Could not transcribe the recording." });
  }
});
