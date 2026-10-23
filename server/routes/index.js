// server/routes/index.js
//
// The router table: the one place a URL maps to a handler.
//
// Every router here is mounted under /api, and each declares its own path so
// that a route's full URL is visible in its own file rather than assembled
// from two places.

import { Router } from "express";
import { healthRoute } from "./health.route.js";
import { modelsRoute } from "./models.route.js";
import { proSchemaRoute } from "./proSchema.route.js";
import { trackRoute } from "./track.route.js";
import { extractCvRoute } from "./extractCv.route.js";
import { cvReaderRoute } from "./cvReader.route.js";
import { transcribeRoute } from "./transcribe.route.js";
import { contactLookupRoute } from "./contactLookup.route.js";
import { chatRoute } from "./chat.route.js";

/** Every /api route, in the order they were originally declared. */
export const apiRoutes = Router();

apiRoutes.use(healthRoute);
apiRoutes.use(trackRoute);
apiRoutes.use(modelsRoute);
apiRoutes.use(proSchemaRoute);
apiRoutes.use(extractCvRoute);
apiRoutes.use(cvReaderRoute);
apiRoutes.use(transcribeRoute);
apiRoutes.use(contactLookupRoute);
apiRoutes.use(chatRoute);
