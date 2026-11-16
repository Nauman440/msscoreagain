import { isIP } from "node:net";
import { auditConfig } from "./config";
import { fetchFollow, fetchOnce, type FetchResult } from "./net";
import { parseHtml } from "./parse";
import { isAllowed, parseRobots, type RobotsFile } from "./robots";
import { loadSitemap, type SitemapData } from "./sitemap";
import type { DomainVariant, PageData } from "./types";
import { bareHost, normalizeLink, pathOf, sameSite } from "./url";

export class AuditError extends Error {}

export interface CrawlData {
  inputUrl: string;
  finalUrl: string;
  origin: string;
  host: string;
  /** Redirect hops from the address the visitor typed to the homepage. */
  entryHops: number;
  pages: PageData[];
  /** Internal URLs the crawler was not allowed to fetch because of robots.txt. */
  blockedByRobots: string[];
  capped: boolean;
  robots: { found: boolean; text: string | null; parsed: RobotsFile | null };
  sitemap: SitemapData;
  variants: DomainVariant[];
  homeHeaders: Record<string, string>;
  platform: "wordpress" | "shopify" | "other";
  durationMs: number;
}

const emptyText = { reviews: false, testimonials: false, licences: false, guarantee: false, gallery: false };

function toPage(result: FetchResult, depth: number | null, siteHost: string): PageData {
  const contentType = result.headers["content-type"] ?? "";
  const isHtml = result.status >= 200 && result.status < 300 && /html/i.test(contentType) && result.body !== null;
  const base: PageData = {
    url: result.url,
    path: pathOf(result.url),
    status: result.status,
    depth,
    redirectTo: result.location ?? undefined,
    error: result.error ?? undefined,
    isHtml,
    fetchMs: result.ms,
    bytes: result.bytes,
    headers: {},
    title: null,
    metaDescription: null,
    noindex: false,
    canonical: null,
    h1Count: 0,
    wordCount: 0,
    hasViewport: false,
    imageCount: 0,
    imagesMissingAlt: 0,
    altTexts: [],
    schemaTypes: [],
    questionHeadings: 0,
    hasTelLink: false,
    mixedContent: 0,
    links: [],
    text: emptyText,
  };
  if (!isHtml || result.body === null) return base;
  return { ...base, ...parseHtml(result.body, result.url, siteHost, result.headers["x-robots-tag"]) };
}

async function checkVariants(host: string, preferredUrl: string): Promise<DomainVariant[]> {
  // An address typed as an IP has no www or http/https variants worth checking.
  if (isIP(host.replace(/^\[|\]$/g, ""))) return [];
  const bare = bareHost(host);
  // "www." only makes sense on a registrable domain, not on a deeper subdomain.
  const hosts = bare.split(".").length <= 3 ? [bare, `www.${bare}`] : [bare];
  const urls = hosts.flatMap((h) => [`http://${h}/`, `https://${h}/`]);
  const preferred = new URL(preferredUrl);
  return Promise.all(
    urls.map(async (url): Promise<DomainVariant> => {
      const { hops, final } = await fetchFollow(url, { timeoutMs: 8_000 }, 5);
      const first = hops[0];
      const label = url.replace(/\/$/, "");
      if (first.status === 0) {
        return { url: label, status: null, ok: false, note: `Does not load: ${first.error ?? "no response"}` };
      }
      const isPreferred = new URL(url).origin === preferred.origin;
      if (isPreferred) {
        return { url: label, status: first.status, ok: first.status < 400, note: `Returns ${first.status}, preferred version` };
      }
      if (first.status >= 300 && first.status < 400) {
        const landsOnPreferred = final.status !== 0 && new URL(final.url).origin === preferred.origin;
        const permanent = first.status === 301 || first.status === 308;
        if (landsOnPreferred && permanent && hops.length <= 3) {
          return { url: label, status: first.status, ok: true, note: `${first.status} redirect to ${preferred.origin}` };
        }
        if (landsOnPreferred) {
          return {
            url: label,
            status: first.status,
            ok: false,
            note: permanent
              ? `Reaches ${preferred.origin} through ${hops.length - 1} redirects. Use a single redirect`
              : `${first.status} is a temporary redirect. Use a permanent 301 redirect`,
          };
        }
        return { url: label, status: first.status, ok: false, note: `Redirects somewhere else: ${final.url}` };
      }
      if (first.status >= 200 && first.status < 300) {
        return { url: label, status: first.status, ok: false, note: `Returns ${first.status}, does not redirect. Creates duplicate pages` };
      }
      return { url: label, status: first.status, ok: false, note: `Returns ${first.status}` };
    }),
  );
}

/** Crawls one website and gathers everything the checks need. */
export async function crawlSite(
  input: URL,
  onProgress: (pagesCrawled: number, stage: string) => void,
): Promise<CrawlData> {
  const started = Date.now();
  const deadline = started + auditConfig.crawlBudgetMs;

  // 1. Find the real homepage, falling back to http when https does not answer.
  let entry = await fetchFollow(input.href, { readBody: true });
  if (entry.final.status === 0 && input.protocol === "https:") {
    const plain = new URL(input.href);
    plain.protocol = "http:";
    const retry = await fetchFollow(plain.href, { readBody: true });
    if (retry.final.status !== 0) entry = retry;
  }
  const home = entry.final;
  if (home.status === 0) throw new AuditError(home.error ?? "The website could not be reached.");
  if (home.status === 401 || home.status === 403) {
    throw new AuditError("The website blocked our audit (access denied). Allow MSScoreBot in your firewall and try again.");
  }
  if (home.status >= 400) throw new AuditError(`The website returned an error (status ${home.status}).`);
  if (home.location) throw new AuditError("The website redirects too many times to be audited.");
  if (!/html/i.test(home.headers["content-type"] ?? "")) {
    throw new AuditError("That address does not return a web page.");
  }

  const homeHtml = home.body ?? "";
  const platform = /\/wp-(?:content|includes)\//.test(homeHtml)
    ? "wordpress"
    : /cdn\.shopify\.com|Shopify\.theme/.test(homeHtml)
      ? "shopify"
      : "other";
  const finalUrl = new URL(home.url);
  const origin = finalUrl.origin;
  const host = finalUrl.hostname;

  // 2. robots.txt
  const robotsFetch = await fetchFollow(`${origin}/robots.txt`, { readBody: true, maxBytes: 500_000, accept: "text/plain,*/*;q=0.5" });
  const robotsText =
    robotsFetch.final.status === 200 &&
    robotsFetch.final.body !== null &&
    !/html/i.test(robotsFetch.final.headers["content-type"] ?? "")
      ? robotsFetch.final.body
      : null;
  const robots = robotsText !== null ? parseRobots(robotsText) : null;

  // 3. Sitemap and domain variants run alongside the crawl.
  const sitemapPromise = loadSitemap(origin, robots?.sitemaps ?? []);
  const variantsPromise = checkVariants(host, home.url);

  // 4. Breadth-first crawl from the homepage.
  const pages = new Map<string, PageData>();
  const seen = new Set<string>();
  const blockedByRobots = new Set<string>();
  const queue: { url: string; depth: number | null }[] = [];
  let capped = false;

  const homeUrl = normalizeLink(home.url, home.url, host) ?? home.url;
  seen.add(homeUrl);
  const homePage = toPage(home, 0, host);
  homePage.url = homeUrl;
  pages.set(homeUrl, homePage);

  const enqueue = (url: string, depth: number | null) => {
    if (seen.has(url)) return;
    seen.add(url);
    if (robots && !isAllowed(robots, auditConfig.userAgentToken, pathOf(url))) {
      blockedByRobots.add(url);
      return;
    }
    queue.push({ url, depth });
  };
  for (const link of homePage.links) enqueue(link, 1);
  onProgress(pages.size, "Crawling your pages");

  const drain = async () => {
    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        if (pages.size >= auditConfig.pageCap || Date.now() > deadline) {
          capped = true;
          return;
        }
        const item = queue[cursor];
        cursor += 1;
        // Reserve the slot so parallel workers cannot overshoot the cap.
        if (pages.has(item.url)) continue;
        pages.set(item.url, toPage({ url: item.url, status: 0, headers: {}, body: null, bytes: 0, ms: 0, location: null, error: "pending" }, item.depth, host));
        const result = await fetchOnce(item.url, { readBody: true });
        const page = toPage(result, item.depth, host);
        page.url = item.url;
        page.path = pathOf(item.url);
        pages.set(item.url, page);
        if (page.redirectTo) {
          const target = normalizeLink(page.redirectTo, item.url, host);
          if (target) enqueue(target, item.depth);
        } else if (page.isHtml && item.depth !== null) {
          for (const link of page.links) enqueue(link, item.depth + 1);
        }
        onProgress(pages.size, "Crawling your pages");
      }
    };
    await Promise.all(Array.from({ length: auditConfig.concurrency }, worker));
    queue.splice(0, cursor);
  };
  await drain();

  // 5. Pages that are only in the sitemap (nothing links to them) fill what is left of the budget.
  const sitemap = await sitemapPromise;
  if (!capped) {
    for (const loc of sitemap.urls) {
      const normalized = normalizeLink(loc, origin, host);
      if (normalized && sameSite(new URL(normalized).hostname, host)) enqueue(normalized, null);
    }
    await drain();
  }
  if (queue.length > 0) capped = true;

  const variants = await variantsPromise;

  // Drop slots reserved by a worker that hit the deadline before finishing.
  const finished = [...pages.values()].filter((page) => page.error !== "pending");
  for (const page of finished) page.headers = {};

  return {
    inputUrl: input.href,
    finalUrl: home.url,
    origin,
    host,
    entryHops: entry.hops.length - 1,
    pages: finished,
    blockedByRobots: [...blockedByRobots],
    capped,
    robots: { found: robotsText !== null, text: robotsText, parsed: robots },
    sitemap,
    variants,
    homeHeaders: home.headers,
    platform,
    durationMs: Date.now() - started,
  };
}
