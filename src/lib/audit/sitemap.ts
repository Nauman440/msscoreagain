import { auditConfig } from "./config";
import { fetchFollow } from "./net";

export interface SitemapData {
  found: boolean;
  /** The sitemap that was read (the index file when there is one). */
  url: string | null;
  /** Every <loc> entry, duplicates included. */
  urls: string[];
  /** False when a file was found at the address but it was not a readable sitemap. */
  valid: boolean;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractLocs(xml: string): string[] {
  const out: string[] = [];
  const pattern = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml))) out.push(decodeEntities(match[1].trim()));
  return out;
}

async function fetchXml(url: string): Promise<string | null> {
  const { final } = await fetchFollow(url, {
    readBody: true,
    maxBytes: 5_000_000,
    accept: "application/xml,text/xml,*/*;q=0.5",
  });
  if (final.status !== 200 || !final.body) return null;
  return final.body;
}

/** Finds and reads the site's sitemap, following one level of sitemap index. */
export async function loadSitemap(origin: string, fromRobots: string[]): Promise<SitemapData> {
  const candidates = fromRobots.length
    ? fromRobots.slice(0, 3)
    : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/wp-sitemap.xml`];
  let sawInvalid: string | null = null;
  for (const candidate of candidates) {
    const xml = await fetchXml(candidate);
    if (!xml) continue;
    if (/<sitemapindex[\s>]/i.test(xml)) {
      const children = extractLocs(xml)
        .filter((loc) => !/\.gz(?:\?|$)/i.test(loc))
        .slice(0, 8);
      const urls: string[] = [];
      const bodies = await Promise.all(children.map((child) => fetchXml(child)));
      for (const body of bodies) {
        if (!body) continue;
        for (const loc of extractLocs(body)) {
          if (urls.length >= auditConfig.maxSitemapUrls) break;
          urls.push(loc);
        }
      }
      return { found: true, url: candidate, urls, valid: true };
    }
    if (/<urlset[\s>]/i.test(xml)) {
      return { found: true, url: candidate, urls: extractLocs(xml).slice(0, auditConfig.maxSitemapUrls), valid: true };
    }
    sawInvalid = sawInvalid ?? candidate;
  }
  if (sawInvalid) return { found: true, url: sawInvalid, urls: [], valid: false };
  return { found: false, url: null, urls: [], valid: false };
}
