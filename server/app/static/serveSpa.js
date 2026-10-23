// server/app/static/serveSpa.js
//
// Serves the built frontend and renders the admin-managed SEO head into it.
//
// The app is a client-rendered SPA, so a crawler that does not run JavaScript
// sees only an empty <div id="root">. Google renders JS eventually; the AI
// crawlers (GPTBot, ClaudeBot, PerplexityBot, …) do not. Rewriting the head
// here means every crawler gets the real title, description and structured
// data in the first response — and the admin can change it without a deploy.

import path from "node:path";
import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { recordPageView } from "../../traffic.js";
import { fetchSeo } from "../../services/seo/fetchSeo.js";
import { renderSeoBlock } from "../../services/seo/renderSeoBlock.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Vite writes dist/ to the repository root, three levels above this file.
const dist = path.join(__dirname, "..", "..", "..", "dist");
const indexPath = path.join(dist, "index.html");

const SEO_BLOCK = /<!-- SEO:START -->[\s\S]*?<!-- SEO:END -->/;

let indexTemplate = null;

/** Read index.html, cached — dist/ is immutable for the life of a deploy. */
function template() {
  if (indexTemplate === null) indexTemplate = readFileSync(indexPath, "utf8");
  return indexTemplate;
}

/**
 * Mount static file serving and the SPA catch-all on an app.
 *
 * Must be mounted after the API routes: the catch-all answers everything.
 *
 * @param {import("express").Express} app
 */
export function serveSpa(app) {
  // index: false so that "/" falls through to the handler below and gets the
  // rendered head rather than the raw file.
  app.use(express.static(dist, { index: false }));

  app.get("*", async (req, res) => {
    // The one funnel every real page load passes through: static assets are
    // served above, so anything reaching here is a document request. Logged
    // fire-and-forget so a tracking outage cannot stop the page rendering.
    // Subsequent in-app navigations arrive via POST /api/track instead.
    recordPageView(req, { path: req.path, referrer: req.headers.referer });

    let html;
    try {
      html = template();
    } catch (err) {
      console.error("[seo] could not read index.html:", err?.message || err);
      return res.status(500).send("Server error");
    }

    try {
      const seo = await fetchSeo();
      // Anything falsy, or a head without the markers, keeps the static
      // fallback.
      if (seo && Object.keys(seo).length && SEO_BLOCK.test(html)) {
        html = html.replace(
          SEO_BLOCK,
          `<!-- SEO:START -->\n    ${renderSeoBlock(seo)}\n    <!-- SEO:END -->`
        );
      }
    } catch (err) {
      console.error("[seo] render failed, serving static head:", err?.message || err);
    }

    res.type("html").send(html);
  });
}
