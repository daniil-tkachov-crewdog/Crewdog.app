// server/routes/extractCv.route.js
//
// POST /api/extract-cv — turn an uploaded PDF into plain text for the chat
// composer's attach button.

import { Router } from "express";
import { CvReaderError, decodePdf, pdfToText } from "../cvReader.js";

export const extractCvRoute = Router();

/**
 * POST /api/extract-cv  { dataBase64, filename? }
 * → { text, filename, chars }
 *
 * Unauthenticated on purpose: nothing is stored and nothing is charged — the
 * text goes straight back to the caller to attach to their own prompt. The
 * CV upload that does keep the document is /api/cv-reader.
 */
extractCvRoute.post("/extract-cv", async (req, res) => {
  try {
    const { dataBase64, filename } = req.body ?? {};
    if (typeof dataBase64 !== "string" || !dataBase64) {
      return res.status(400).json({ error: "dataBase64 is required" });
    }

    // Decoding, the size guard and the PDF read all live in cvReader.js,
    // which /api/cv-reader shares with this route.
    const buf = decodePdf(dataBase64);
    const text = await pdfToText(buf);

    res.json({ text, filename: filename || "CV.pdf", chars: text.length });
  } catch (err) {
    if (err instanceof CvReaderError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error("[/api/extract-cv]", err?.message || err);
    res.status(500).json({ error: "Could not read the PDF." });
  }
});
