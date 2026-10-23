// server/services/seo/renderSeoBlock.js
//
// Renders the admin-managed metadata as the <head> fragment that replaces
// everything between the SEO:START and SEO:END markers in index.html.

import { escapeAttr } from "../../functions/html/escapeAttr.js";
import { jsonLd } from "../../functions/html/jsonLd.js";
import { metaName } from "../../functions/html/metaName.js";
import { metaProp } from "../../functions/html/metaProp.js";

/**
 * Build the SEO head fragment.
 *
 * Every tag is omitted rather than emitted empty when its value is missing,
 * so a half-filled admin panel degrades to fewer tags instead of blank ones.
 * The three JSON-LD blocks (Organization, SoftwareApplication and, when there
 * are entries, FAQPage) are what the AI crawlers actually read.
 *
 * @param {object} seo  The metadata row from fetchSeo().
 * @returns {string}    HTML, newline-and-indent joined to sit inside <head>.
 */
export function renderSeoBlock(seo) {
  const canonical = seo.canonical || "https://crewdog.app/";
  const image = seo.og_image || "https://crewdog.app/CrewDog-Thumbnail.png";
  const ogTitle = seo.og_title || seo.title;
  const ogDescription = seo.og_description || seo.description;
  const faq = Array.isArray(seo.faq)
    ? seo.faq.filter((f) => f && f.q && f.a)
    : [];

  const parts = [
    seo.title ? `<title>${escapeAttr(seo.title)}</title>` : "",
    metaName("description", seo.description),
    metaName("keywords", seo.keywords),
    metaName("author", "CrewDog"),
    metaName("robots", "index,follow"),
    metaName("language", "en"),
    metaName("distribution", "global"),
    `<link rel="canonical" href="${escapeAttr(canonical)}" />`,

    metaProp("og:locale", "en_GB"),
    metaProp("og:site_name", "CrewDog"),
    metaProp("og:title", ogTitle),
    metaProp("og:description", ogDescription),
    metaProp("og:type", "website"),
    metaProp("og:url", canonical),
    metaProp("og:image", image),
    metaProp("og:image:width", "1200"),
    metaProp("og:image:height", "630"),
    metaProp("og:image:alt", ogTitle),

    metaName("twitter:card", "summary_large_image"),
    metaName("twitter:site", "@crewdog"),
    metaName("twitter:title", seo.twitter_title || ogTitle),
    metaName("twitter:description", seo.twitter_description || ogDescription),
    metaName("twitter:image", image),
    metaName("twitter:image:alt", seo.twitter_title || ogTitle),

    `<script type="application/ld+json">${jsonLd({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "CrewDog",
      url: canonical,
      logo: image,
      description: seo.org_description || seo.description || "",
    })}</script>`,

    `<script type="application/ld+json">${jsonLd({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "CrewDog",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: canonical,
      image,
      description: seo.app_description || seo.description || "",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "GBP",
        description: "Start your first CrewDog search for free.",
      },
    })}</script>`,

    faq.length
      ? `<script type="application/ld+json">${jsonLd({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faq.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        })}</script>`
      : "",
  ];

  return parts.filter(Boolean).join("\n    ");
}
