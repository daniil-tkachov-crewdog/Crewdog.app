// server/app/middleware/blockScanners.js
//
// Turns away vulnerability scanners before they reach anything expensive.

import { isBlockedPath } from "../../blocklist.js";
import { recordPageView } from "../../traffic.js";

/**
 * Express middleware: answer a bare 404 to scanner paths (/.git/HEAD, /.env,
 * /wp-login.php, …) before body parsing, static files or the SPA handler.
 *
 * The view is still logged, so these probes stay visible in the admin traffic
 * tab. Search and AI crawlers never request these paths, so indexing is
 * unaffected.
 *
 * Mounted first, which is the whole point — it is cheap only if nothing runs
 * ahead of it.
 */
export function blockScanners(req, res, next) {
  if (!isBlockedPath(req.path)) return next();
  recordPageView(req, { path: req.path, referrer: req.headers.referer });
  res.status(404).type("text/plain").send("Not found");
}
