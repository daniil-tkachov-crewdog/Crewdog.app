// server/routes/health.route.js
//
// GET /api/health — liveness only. Deliberately touches nothing: no
// database, no OpenAI, so a dependency being down does not make the process
// look dead to a platform health check.

import { Router } from "express";

export const healthRoute = Router();

healthRoute.get("/health", (_req, res) => res.json({ ok: true }));
