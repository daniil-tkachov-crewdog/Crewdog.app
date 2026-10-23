// server/routes/track.route.js
//
// POST /api/track — one page view from the SPA.

import { Router } from "express";
import { recordPageView } from "../traffic.js";

export const trackRoute = Router();

/**
 * The SPA catch-all only sees the initial document request, so every
 * client-side route change after that would be invisible without this.
 *
 * The body carries the path and referrer only: the IP, user agent and geo are
 * read from the request itself, so a caller cannot forge where a visit came
 * from. Answers 204 immediately and logs in the background — sendBeacon
 * ignores the response, and a tracking failure must never surface to the
 * visitor.
 */
trackRoute.post("/track", (req, res) => {
  res.status(204).end();
  recordPageView(req, {
    path: req.body?.path,
    referrer: req.body?.referrer,
    userId: req.userId,
  });
});
