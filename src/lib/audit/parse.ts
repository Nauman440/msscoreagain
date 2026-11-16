import * as cheerio from "cheerio";
import type { PageData } from "./types";
import { normalizeLink } from "./url";

type Parsed = Pick<
  PageData,
  | "title"
  | "metaDescription"
  | "noindex"
  | "canonical"
  | "h1Count"
  | "wordCount"
  | "hasViewport"
  | "imageCount"
  | "imagesMissingAlt"
  | "altTexts"
  | "schemaTypes"
  | "questionHeadings"
  | "hasTelLink"
  | "mixedContent"
  | "links"
  | "text"
>;

function collectTypes(node: unknown, out: Set<string>, depth = 0): void {
  if (!node || depth > 6) return;
  if (Array.isArray(node)) {
    for (const item of node) collectTypes(item, out, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  const type = record["@type"];
  if (typeof type === "string") out.add(type);
  else if (Array.isArray(type)) for (const t of type) if (typeof t === "string") out.add(t);
  for (const value of Object.values(record)) {
    if (value && typeof value === "object") collectTypes(value, out, depth + 1);
  }
}

/** Reads everything the checks need from one HTML page. */
export function parseHtml(html: string, pageUrl: string, siteHost: string, xRobotsTag: string | undefined): Parsed {
  const $ = cheerio.load(html);
  const isHttps = pageUrl.startsWith("https:");

  const title = $("head title").first().text().replace(/\s+/g, " ").trim() || null;
  const metaDescription =
    $('meta[name="description" i]').first().attr("content")?.replace(/\s+/g, " ").trim() || null;

  const robotsMeta = $('meta[name="robots" i], meta[name="googlebot" i]')
    .map((_, el) => $(el).attr("content") ?? "")
    .get()
    .join(",")
    .toLowerCase();
  const noindex = /noindex|none/.test(robotsMeta) || /noindex|none/.test((xRobotsTag ?? "").toLowerCase());

  let canonical: string | null = null;
  const canonicalHref = $('link[rel="canonical" i]').first().attr("href");
  if (canonicalHref) {
    try {
      const resolved = new URL(canonicalHref.trim(), pageUrl);
      resolved.hash = "";
      canonical = resolved.href;
    } catch {
      canonical = null;
    }
  }

  const schemaTypes = new Set<string>();
  $('script[type="application/ld+json" i]').each((_, el) => {
    try {
      collectTypes(JSON.parse($(el).contents().text()), schemaTypes);
    } catch {
      // Invalid JSON-LD is ignored: it gives search engines nothing either.
    }
  });
  $("[itemtype]").each((_, el) => {
    const type = ($(el).attr("itemtype") ?? "").split("/").pop();
    if (type) schemaTypes.add(type);
  });

  const links = new Set<string>();
  let hasTelLink = false;
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (/^tel:/i.test(href.trim())) hasTelLink = true;
    if (/\bnofollow\b/i.test($(el).attr("rel") ?? "")) return;
    const normalized = normalizeLink(href, pageUrl, siteHost);
    if (normalized) links.add(normalized);
  });

  let imageCount = 0;
  let imagesMissingAlt = 0;
  const altTexts: string[] = [];
  let mixedContent = 0;
  $("img").each((_, el) => {
    const src = $(el).attr("src") ?? $(el).attr("data-src") ?? "";
    if (!src || src.startsWith("data:")) return;
    // Decorative images are correctly marked with role="presentation" or aria-hidden.
    if ($(el).attr("role") === "presentation" || $(el).attr("aria-hidden") === "true") return;
    imageCount += 1;
    const alt = $(el).attr("alt");
    if (alt === undefined || !alt.trim()) imagesMissingAlt += 1;
    else altTexts.push(alt.trim().toLowerCase());
    if (isHttps && /^http:\/\//i.test(src)) mixedContent += 1;
  });
  if (isHttps) {
    $("script[src], link[rel='stylesheet'][href], iframe[src]").each((_, el) => {
      const src = $(el).attr("src") ?? $(el).attr("href") ?? "";
      if (/^http:\/\//i.test(src)) mixedContent += 1;
    });
  }

  let questionHeadings = 0;
  $("h2, h3, h4, summary, dt").each((_, el) => {
    if ($(el).text().trim().endsWith("?")) questionHeadings += 1;
  });

  const hasViewport = /width\s*=/.test($('meta[name="viewport" i]').first().attr("content") ?? "");
  const h1Count = $("h1").length;

  $("script, style, noscript, template, svg").remove();
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText ? bodyText.split(" ").length : 0;
  const lower = bodyText.toLowerCase();

  return {
    title,
    metaDescription,
    noindex,
    canonical,
    h1Count,
    wordCount,
    hasViewport,
    imageCount,
    imagesMissingAlt,
    altTexts,
    schemaTypes: [...schemaTypes],
    questionHeadings,
    hasTelLink,
    mixedContent,
    links: [...links],
    text: {
      reviews: /\b(?:reviews?|rated|\d(?:\.\d)?\s*(?:stars?|\/\s*5)|google rating)\b/.test(lower),
      testimonials: /\b(?:testimonials?|what (?:our|my) (?:customers|clients) say|happy (?:customers|clients))\b/.test(lower),
      licences: /\b(?:licen[sc]ed|insured|bonded|certified|accredited|certifications?|registered)\b/.test(lower),
      guarantee: /\b(?:guarantee[ds]?|warrant(?:y|ies)|money[- ]back)\b/.test(lower),
      gallery: /\b(?:before (?:and|&) after|gallery|our work|portfolio|case stud(?:y|ies)|projects)\b/.test(lower),
    },
  };
}
