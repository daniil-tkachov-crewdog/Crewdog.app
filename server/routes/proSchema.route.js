// server/routes/proSchema.route.js
//
// GET /api/pro-schema — the built-in Pro output schema.
//
// Exists so the admin panel's "Reset to default" button has one source of
// truth to read, rather than a second copy of the schema living in the
// frontend bundle and drifting from this one.

import { Router } from "express";
import { PRO_SCHEMA_DEFAULT_TEXT } from "../proSchema.js";

export const proSchemaRoute = Router();

proSchemaRoute.get("/pro-schema", (_req, res) => {
  // Sent as pre-serialised text so the admin sees the same formatting the
  // default is written in, rather than whatever JSON.stringify would produce.
  res.type("application/json").send(PRO_SCHEMA_DEFAULT_TEXT);
});
