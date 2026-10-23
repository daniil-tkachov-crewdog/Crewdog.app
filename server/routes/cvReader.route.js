// server/routes/cvReader.route.js
//
// POST /api/cv-reader — the account page's CV upload.

import { Router } from "express";
import {
  CvReaderError,
  decodePdf,
  extractCvFields,
  pdfToText,
  storeCv,
} from "../cvReader.js";
import { openai } from "../integrations/openai/client.js";

export const cvReaderRoute = Router();

/**
 * POST /api/cv-reader  { dataBase64, filename? }
 * → { cv, profile }
 *
 * Reads the PDF, asks the model who this is, stores the file in the private
 * `cvs` bucket and saves the details to the caller's profile.
 *
 * This is the same PDF /api/extract-cv reads, but a different job: the
 * composer wants text for one prompt and keeps nothing, while this keeps the
 * document and the profile it fills. Hence a second route rather than a flag.
 */
cvReaderRoute.post("/cv-reader", async (req, res) => {
  try {
    // A CV is personal data stored under an account, and the parse costs
    // money, so this needs an identity exactly like /api/transcribe. The
    // storage object and both rows are written as the caller, so the token is
    // also what the RLS policies check.
    if (!req.userId) {
      return res
        .status(401)
        .json({ error: "Log in to upload your CV.", code: "auth_required" });
    }

    const { dataBase64, filename } = req.body ?? {};
    if (typeof dataBase64 !== "string" || !dataBase64) {
      return res.status(400).json({ error: "dataBase64 is required" });
    }

    const buf = decodePdf(dataBase64);
    const text = await pdfToText(buf);
    const fields = await extractCvFields(openai, text);
    const { cv, profile } = await storeCv({
      accessToken: req.accessToken,
      userId: req.userId,
      buffer: buf,
      filename: filename || "CV.pdf",
      fields,
    });

    console.log(
      `[cv-reader] user=${req.userId} file=${cv.file_name} chars=${text.length}`
    );
    res.json({ cv, profile });
  } catch (err) {
    if (err instanceof CvReaderError) {
      console.error("[cv-reader]", err.message);
      return res.status(err.status).json({ error: err.message });
    }
    console.error("[cv-reader]", err?.message || err);
    res.status(500).json({ error: "Could not read your CV." });
  }
});
