// server/app/createApp.js
//
// Assembles the express application. Mount order is behaviour here, not
// style, so each step says why it sits where it does.

import express from "express";
import { attachUser } from "../usage.js";
import { blockScanners } from "./middleware/blockScanners.js";
import { apiRoutes } from "../routes/index.js";
import { serveSpa } from "./static/serveSpa.js";

/**
 * Build the app, fully wired, without listening.
 *
 * Returning it unlistened is what lets a test drive the real routes without
 * binding a port.
 *
 * @returns {import("express").Express}
 */
export function createApp() {
  const app = express();

  // Render puts a proxy in front of us, so the client address lives in
  // x-forwarded-for rather than on the socket. Without this req.ip is the
  // proxy, and every visitor shares one IP in the traffic tab.
  app.set("trust proxy", true);

  // Before body parsing and before static: a scanner probe should cost as
  // little as possible.
  app.use(blockScanners);

  // Raised from 1mb to accommodate base64-encoded CV uploads.
  app.use(express.json({ limit: "15mb" }));

  // Populates req.userId from the Supabase bearer token when one is present.
  // It never rejects — each route decides whether auth is required.
  app.use("/api", attachUser);

  app.use("/api", apiRoutes);

  // Last: the catch-all answers everything that is left.
  serveSpa(app);

  return app;
}
