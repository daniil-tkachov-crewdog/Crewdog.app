// server/routes/contactLookup.route.js
//
// POST /api/contact-lookup — reveals one contact datapoint for one LinkedIn
// profile via Lusha.
//
// This is the only paid third-party call in the app a user triggers directly,
// and Lusha bills per revealed datapoint, so every guard here is a cost
// guard. In order, cheapest first: signed in, well-formed profile URL,
// switched on in the admin, not already bought. Lusha is reached only after
// all four pass.

import { Router } from "express";
import { normalizeUrl } from "../linkedinFinder.js";
import { lookupContact } from "../lusha.js";
import {
  lushaEnabled,
  readCachedLookup,
  writeCachedLookup,
} from "../contactLookups.js";

export const contactLookupRoute = Router();

/**
 * POST /api/contact-lookup  { linkedinUrl, field: "phone" | "email" }
 * → { status, phones?, emails?, cached? }
 */
contactLookupRoute.post("/contact-lookup", async (req, res) => {
  try {
    // Signed-in only. The buttons are per-card, so an anonymous visitor
    // running one search could otherwise spend the whole credit balance in a
    // minute.
    if (!req.userId) {
      return res
        .status(401)
        .json({ status: "error", message: "Please sign in first." });
    }

    const { linkedinUrl, field } = req.body ?? {};
    if (field !== "phone" && field !== "email") {
      return res.status(400).json({ status: "error", message: "Unknown field." });
    }

    // normalizeUrl returns "" for anything that is not linkedin.com/in/<slug>,
    // which keeps an arbitrary URL from becoming a billable Lusha call, and
    // collapses the same person's variant URLs onto one cache row.
    const url = normalizeUrl(linkedinUrl);
    if (!url) {
      return res
        .status(400)
        .json({ status: "error", message: "Not a LinkedIn profile URL." });
    }

    if (!(await lushaEnabled())) {
      return res
        .status(403)
        .json({ status: "disabled", message: "Contact lookup is switched off." });
    }

    const cached = await readCachedLookup(url, field);
    if (cached) {
      const values = field === "email" ? cached.emails : cached.phones;
      return res.json(
        values.length
          ? { status: "success", ...cached, cached: true }
          : { status: "not_found", cached: true }
      );
    }

    const result = await lookupContact({ linkedinUrl: url, field });

    // Cache both a hit and a confirmed miss, but never an error: a timeout is
    // not evidence that Lusha has nothing, and storing it would permanently
    // hide a contact we never actually asked about.
    if (result.status === "success" || result.status === "not_found") {
      await writeCachedLookup(url, field, {
        phones: result.phones ?? [],
        emails: result.emails ?? [],
      });
    }

    console.log(
      `[contacts] user=${req.userId} field=${field} url=${url} -> ${result.status}`
    );
    res.status(result.status === "disabled" ? 503 : 200).json(result);
  } catch (err) {
    console.error("[/api/contact-lookup]", err?.message || err);
    res
      .status(500)
      .json({ status: "error", message: "Contact lookup is unavailable right now." });
  }
});
