import { AI_CRAWLERS, auditConfig } from "./config";
import type { CrawlData } from "./crawl";
import { hasNamedGroup, isAllowed, isFullyBlocked } from "./robots";
import { categoryScores, estimateAfterFixes, overallScore, ratioScore, scoreLabel, type Check } from "./scoring";
import {
  SEVERITY_ORDER,
  type AuditResult,
  type CheckRow,
  type CoreWebVitals,
  type Issue,
  type PageData,
  type SchemaRow,
  type Severity,
} from "./types";
import { isUtilityPath, pathOf, sameUrl } from "./url";

const plural = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString("en")} ${count === 1 ? one : many}`;
/** Picks the verb form that agrees with a count ("1 page has", "2 pages have"). */
const agree = (count: number, one: string, many: string) => (count === 1 ? one : many);
const urlKey = (url: string) => {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}${u.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
};
const problemRows = (rows: CheckRow[]) => rows.filter((row) => row.status === "fail" || row.status === "warn").length;

/** Schema types that describe page plumbing, not the business itself. */
const GENERIC_SCHEMA = new Set([
  "WebSite", "WebPage", "BreadcrumbList", "ListItem", "SearchAction", "ImageObject", "ReadAction", "EntryPoint",
  "PropertyValueSpecification", "SiteNavigationElement", "WPHeader", "WPFooter", "CollectionPage", "ItemList",
  "Article", "BlogPosting", "NewsArticle", "Person", "Question", "Answer", "FAQPage", "VideoObject", "Thing",
]);

/** Turns crawl data into the scored report. */
export function analyze(crawl: CrawlData, cwv: CoreWebVitals): AuditResult {
  const checks: Check[] = [];
  const pages = crawl.pages;
  const html = pages.filter((page) => page.isHtml);
  const content = html.filter((page) => !isUtilityPath(page.path));
  const indexable = content.filter((page) => !page.noindex && (!page.canonical || sameUrl(page.canonical, page.url)));
  const home = html.find((page) => page.depth === 0) ?? html[0];
  const byUrl = new Map(pages.map((page) => [urlKey(page.url), page]));
  const total = Math.max(1, content.length);
  const paths = (list: PageData[]) => list.map((page) => page.path);

  // ---------- Indexing: noindex and robots.txt ----------
  const noindexPages = content.filter((page) => page.noindex);
  const blockedContent = crawl.blockedByRobots.map(pathOf).filter((path) => !isUtilityPath(path));
  const siteBlocked = crawl.robots.parsed ? isFullyBlocked(crawl.robots.parsed, "googlebot") : false;
  const notIndexable = noindexPages.length + blockedContent.length;
  checks.push({
    id: "blocked-from-indexing",
    category: "technical",
    severity: "critical",
    weight: 3,
    score: siteBlocked ? 0 : ratioScore(notIndexable, total + blockedContent.length),
    issue: {
      title: siteBlocked ? "robots.txt blocks your whole website from Google" : "Important pages blocked from indexing",
      detail: siteBlocked
        ? "A Disallow rule in robots.txt tells Google not to crawl any page."
        : `${plural(notIndexable, "page")} ${notIndexable === 1 ? "has" : "have"} a noindex tag or ${notIndexable === 1 ? "is" : "are"} blocked in robots.txt`,
      fix: "Remove the noindex tag or the robots.txt rule for every page you want customers to find. Keep them only on private pages such as carts and admin areas.",
      affected: [
        ...noindexPages.map((page) => `${page.path} (noindex tag)`),
        ...blockedContent.map((path) => `${path} (blocked in robots.txt)`),
      ],
      count: siteBlocked ? Math.max(1, notIndexable) : notIndexable,
    },
  });

  // ---------- Status codes ----------
  const count2 = pages.filter((page) => page.status >= 200 && page.status < 300).length;
  const redirects = pages.filter((page) => page.status >= 300 && page.status < 400);
  const notFound = pages.filter((page) => page.status >= 400 && page.status < 500);
  const serverErrors = pages.filter((page) => page.status >= 500 || page.status === 0);
  const broken = [...notFound, ...serverErrors];
  const describeStatus = (page: PageData) => (page.status === 0 ? " did not respond" : ` returns ${page.status}`);
  const statusRows: CheckRow[] = broken.length
    ? broken.slice(0, 5).map((page) => ({ status: "fail", path: page.path, text: describeStatus(page) }))
    : [{ status: "pass", text: `No broken pages among the ${plural(pages.length, "page")} crawled` }];
  checks.push({
    id: "broken-pages",
    category: "technical",
    severity: "critical",
    weight: 3,
    score: ratioScore(broken.length, pages.length),
    issue: {
      title: "Broken pages with incoming links",
      detail: `${plural(broken.length, "page")} ${broken.length === 1 ? "returns an error and is" : "return errors and are"} still linked from your website`,
      fix: "Restore each page, or redirect it to the closest working page and update the links that point to it.",
      affected: broken.map((page) => `${page.path} (${page.status === 0 ? "no response" : page.status})`),
    },
  });
  const linkedRedirects = redirects.filter((page) => page.depth !== null);
  checks.push({
    id: "redirected-links",
    category: "technical",
    severity: "low",
    weight: 1,
    score: ratioScore(linkedRedirects.length, pages.length),
    issue: {
      title: "Internal links point to redirected pages",
      detail: `${plural(linkedRedirects.length, "link target")} ${linkedRedirects.length === 1 ? "redirects" : "redirect"} before reaching the real page`,
      fix: "Update the links to point straight at the final address. Each extra redirect slows visitors and search engines down.",
      affected: linkedRedirects.map((page) => `${page.path} -> ${page.redirectTo ? pathOf(page.redirectTo) : "?"}`),
    },
  });

  // ---------- Canonical tags ----------
  const canonicalMissing = content.filter((page) => !page.canonical);
  const canonicalBroken = content.filter((page) => {
    if (!page.canonical) return false;
    const target = byUrl.get(urlKey(page.canonical));
    return target !== undefined && target.url !== page.url && (target.status < 200 || target.status >= 300);
  });
  const canonicalOther = content.filter(
    (page) => page.canonical && !sameUrl(page.canonical, page.url) && !canonicalBroken.includes(page),
  );
  const canonicalRows: CheckRow[] = [
    canonicalMissing.length
      ? { status: "warn", text: `Canonical tag missing on ${plural(canonicalMissing.length, "page")}` }
      : { status: "pass", text: "Every page has a canonical tag" },
    canonicalBroken.length
      ? { status: "fail", text: `${plural(canonicalBroken.length, "canonical")} ${agree(canonicalBroken.length, "points", "point")} to redirected or broken URLs` }
      : { status: "pass", text: "No canonical tags point to redirected or broken URLs" },
    canonicalOther.length
      ? { status: "warn", text: `${plural(canonicalOther.length, "page")} canonicalise to a different page. Confirm this is intended` }
      : { status: "pass", text: "No pages canonicalise to a different page" },
    home?.canonical && sameUrl(home.canonical, home.url)
      ? { status: "pass", text: "Homepage canonical is correct" }
      : { status: "warn", text: home?.canonical ? "Homepage canonical points to a different address" : "Homepage has no canonical tag" },
  ];
  checks.push({
    id: "canonical-broken",
    category: "technical",
    severity: "high",
    weight: 2,
    score: ratioScore(canonicalBroken.length, total),
    issue: {
      title: "Canonical tags point to broken or redirected pages",
      detail: `${plural(canonicalBroken.length, "page")} ${agree(canonicalBroken.length, "tells", "tell")} Google that a page which does not load is the main version`,
      fix: "Point each canonical tag at the working address of the page itself.",
      affected: paths(canonicalBroken),
    },
  });
  checks.push({
    id: "canonical-missing",
    category: "technical",
    severity: "low",
    weight: 1,
    score: ratioScore(canonicalMissing.length, total),
    issue: {
      title: "Pages without a canonical tag",
      detail: `${plural(canonicalMissing.length, "page")} ${agree(canonicalMissing.length, "does not", "do not")} say which address is the main version`,
      fix: "Add a canonical tag pointing to the page's own preferred address. Most SEO plugins do this automatically.",
      affected: paths(canonicalMissing),
    },
  });

  // ---------- Domain variants ----------
  const variantProblems = crawl.variants.filter((variant) => !variant.ok);
  const duplicateVariant = variantProblems.some((variant) => variant.status !== null && variant.status >= 200 && variant.status < 300);
  checks.push({
    id: "domain-variants",
    category: "technical",
    severity: duplicateVariant ? "high" : "medium",
    weight: 2,
    score: variantProblems.length ? (duplicateVariant ? 0 : 0.5) : 1,
    issue: {
      title: "http, https and www versions do not all lead to one address",
      detail: `${plural(variantProblems.length, "version")} of your address ${variantProblems.length === 1 ? "does" : "do"} not redirect cleanly to ${crawl.origin}`,
      fix: `Redirect every version with a single permanent (301) redirect to ${crawl.origin}.`,
      affected: variantProblems.map((variant) => `${variant.url}: ${variant.note}`),
    },
  });

  // ---------- robots.txt ----------
  const robots = crawl.robots.parsed;
  const sitemapInRobots = (robots?.sitemaps.length ?? 0) > 0;
  const assetPaths = ["/wp-content/themes/site/style.css", "/wp-includes/js/app.js", "/assets/app.css", "/assets/app.js", "/static/app.js", "/_next/static/app.js", "/css/site.css", "/js/site.js"];
  const assetsBlocked = robots ? assetPaths.some((path) => !isAllowed(robots, "googlebot", path)) : false;
  const aiBlocked = robots ? AI_CRAWLERS.filter((agent) => isFullyBlocked(robots, agent) && (hasNamedGroup(robots, agent) || siteBlocked)) : [];
  const robotsRows: CheckRow[] = [];
  if (!crawl.robots.found) {
    robotsRows.push({ status: "fail", text: "No robots.txt file found" });
  } else {
    robotsRows.push({ status: "pass", text: "File found and readable" });
    robotsRows.push(
      sitemapInRobots
        ? { status: "pass", text: "Sitemap URL is listed in the file" }
        : { status: "fail", text: "Sitemap URL is not listed in the file" },
    );
    robotsRows.push(
      siteBlocked
        ? { status: "fail", text: "A rule blocks the whole website from Google" }
        : blockedContent.length
          ? { status: "fail", text: `A rule blocks ${plural(blockedContent.length, "page")} from crawling` }
          : { status: "pass", text: "No important pages are blocked from crawling" },
    );
    robotsRows.push(
      aiBlocked.length
        ? { status: "warn", text: `${plural(aiBlocked.length, "AI crawler")} ${aiBlocked.length === 1 ? "is" : "are"} blocked (${aiBlocked.join(", ")}), confirm this is intended` }
        : { status: "pass", text: "AI crawlers are not blocked" },
    );
    robotsRows.push(
      assetsBlocked
        ? { status: "fail", text: "CSS or JavaScript files are blocked, so Google cannot render your pages properly" }
        : { status: "pass", text: "CSS and JavaScript files are not blocked" },
    );
  }
  checks.push({
    id: "robots-missing",
    category: "technical",
    severity: "medium",
    weight: 1,
    score: crawl.robots.found ? 1 : 0,
    issue: {
      title: "No robots.txt file",
      detail: "Search engines look for this file first. Without it they get no guidance and no link to your sitemap",
      fix: "Upload the suggested robots.txt to the root of your website.",
      affected: [`${crawl.origin}/robots.txt`],
    },
  });
  checks.push({
    id: "robots-sitemap",
    category: "technical",
    severity: "low",
    weight: 0.5,
    score: !crawl.robots.found || sitemapInRobots ? 1 : 0,
    issue: {
      title: "Sitemap is not listed in robots.txt",
      detail: "Listing the sitemap helps every search engine find all your pages",
      fix: "Add a line such as \"Sitemap: https://yourdomain.com/sitemap.xml\" to robots.txt.",
      affected: [`${crawl.origin}/robots.txt`],
    },
  });
  checks.push({
    id: "robots-assets",
    category: "technical",
    severity: "high",
    weight: 1.5,
    score: assetsBlocked ? 0 : 1,
    issue: {
      title: "robots.txt blocks CSS or JavaScript files",
      detail: "Google needs these files to see your pages the way visitors do",
      fix: "Remove the Disallow rules that cover your theme, CSS and JavaScript folders.",
      affected: [`${crawl.origin}/robots.txt`],
    },
  });
  const sitemapLine = `Sitemap: ${crawl.sitemap.found && crawl.sitemap.url ? crawl.sitemap.url : `${crawl.origin}/sitemap.xml`}`;
  const suggested =
    crawl.platform === "wordpress"
      ? ["User-agent: *", "Disallow: /wp-admin/", "Allow: /wp-admin/admin-ajax.php", "Disallow: /?s=", "", sitemapLine]
      : crawl.platform === "shopify"
        ? ["User-agent: *", "Disallow: /cart", "Disallow: /checkout", "Disallow: /account", "Disallow: /search", "", sitemapLine]
        : ["User-agent: *", "Allow: /", "", sitemapLine];

  // ---------- Sitemap ----------
  const sitemapKeys = crawl.sitemap.urls.map(urlKey);
  const sitemapSet = new Set(sitemapKeys);
  const sitemapDuplicates = sitemapKeys.length - sitemapSet.size;
  const sitemapChecked = [...sitemapSet].map((key) => byUrl.get(key)).filter((page): page is PageData => page !== undefined);
  const sitemapInvalid = sitemapChecked.filter((page) => !page.isHtml || page.noindex);
  const linkedIndexable = indexable.filter((page) => page.depth !== null);
  const missingFromSitemap = crawl.sitemap.found && crawl.sitemap.valid
    ? linkedIndexable.filter((page) => !sitemapSet.has(urlKey(page.url)))
    : [];
  const sitemapRows: CheckRow[] = [];
  if (!crawl.sitemap.found) {
    sitemapRows.push({ status: "fail", text: "No sitemap found at /sitemap.xml or in robots.txt" });
  } else if (!crawl.sitemap.valid) {
    sitemapRows.push({ status: "fail", text: "A sitemap file exists but it is not valid XML" });
  } else {
    sitemapRows.push({ status: "pass", text: "Sitemap file loads and is valid XML" });
    sitemapRows.push(
      sitemapInvalid.length
        ? { status: "fail", text: `${plural(sitemapInvalid.length, "URL")} ${agree(sitemapInvalid.length, "returns", "return")} redirects, errors or noindex` }
        : { status: "pass", text: `All ${plural(sitemapChecked.length, "checked URL")} load correctly` },
    );
    sitemapRows.push(
      missingFromSitemap.length
        ? { status: "warn", text: `${plural(missingFromSitemap.length, "indexable page")} ${missingFromSitemap.length === 1 ? "is" : "are"} missing from the sitemap` }
        : { status: "pass", text: "Every indexable page we crawled is in the sitemap" },
    );
    if (sitemapDuplicates > 0) sitemapRows.push({ status: "warn", text: `${plural(sitemapDuplicates, "duplicate URL")} in the sitemap` });
    if (sitemapChecked.length < sitemapSet.size) {
      sitemapRows.push({ status: "info", text: `This audit checked ${sitemapChecked.length.toLocaleString("en")} of ${sitemapSet.size.toLocaleString("en")} sitemap URLs` });
    }
  }
  sitemapRows.push({ status: "info", text: "Connect Search Console to check submission status" });
  checks.push({
    id: "sitemap-missing",
    category: "technical",
    severity: "high",
    weight: 2,
    score: crawl.sitemap.found && crawl.sitemap.valid ? 1 : 0,
    issue: {
      title: crawl.sitemap.found ? "Sitemap file is not valid" : "No XML sitemap found",
      detail: "A sitemap tells search engines which pages exist. Without one, new and deep pages can be missed",
      fix: "Generate a sitemap.xml, upload it to the root of your website and submit it in Google Search Console.",
      affected: [crawl.sitemap.url ?? `${crawl.origin}/sitemap.xml`],
    },
  });
  checks.push({
    id: "sitemap-invalid-urls",
    category: "technical",
    severity: "medium",
    weight: 1,
    score: ratioScore(sitemapInvalid.length, sitemapChecked.length),
    issue: {
      title: "Sitemap lists pages that do not work",
      detail: `${plural(sitemapInvalid.length, "sitemap URL")} ${agree(sitemapInvalid.length, "returns", "return")} redirects, errors or a noindex tag`,
      fix: "Remove these addresses from the sitemap, or fix the pages so they load and can be indexed.",
      affected: sitemapInvalid.map((page) => `${page.path} (${page.noindex && page.isHtml ? "noindex" : page.status || "no response"})`),
    },
  });
  checks.push({
    id: "sitemap-missing-pages",
    category: "technical",
    severity: "low",
    weight: 1,
    score: ratioScore(missingFromSitemap.length, linkedIndexable.length),
    issue: {
      title: "Pages missing from the sitemap",
      detail: `${plural(missingFromSitemap.length, "indexable page")} ${missingFromSitemap.length === 1 ? "is" : "are"} not listed in your sitemap`,
      fix: "Add these pages to the sitemap so search engines find them faster.",
      affected: paths(missingFromSitemap),
    },
  });

  // ---------- Structured data ----------
  const hasType = (page: PageData, test: (type: string) => boolean) => page.schemaTypes.some(test);
  const businessSchema = home ? hasType(home, (type) => !GENERIC_SCHEMA.has(type)) : false;
  const withSchema = content.filter((page) => page.schemaTypes.length > 0);
  const breadcrumbPages = content.filter((page) => page.depth !== 0 && hasType(page, (type) => type === "BreadcrumbList"));
  const innerPages = content.filter((page) => page.depth !== 0);
  const faqSchemaPages = content.filter((page) => hasType(page, (type) => type === "FAQPage"));
  const ratingPages = content.filter((page) => hasType(page, (type) => type === "AggregateRating" || type === "Review"));
  const schemaRows: SchemaRow[] = [
    { status: businessSchema ? "found" : "missing", scope: "Homepage", type: "Organization or LocalBusiness" },
    {
      status: innerPages.length === 0 || breadcrumbPages.length >= innerPages.length * 0.9 ? "found" : breadcrumbPages.length ? "partial" : "missing",
      scope: "Inner pages",
      type: innerPages.length ? `BreadcrumbList on ${breadcrumbPages.length} of ${innerPages.length}` : "BreadcrumbList",
    },
    {
      status: faqSchemaPages.length ? "found" : "missing",
      scope: faqSchemaPages.length ? plural(faqSchemaPages.length, "page") : "Service pages",
      type: "FAQPage",
    },
    { status: ratingPages.length ? "found" : "missing", scope: "Reviews", type: "AggregateRating" },
  ];
  const schemaCoverage = Math.round((100 * withSchema.length) / total);
  checks.push({
    id: "schema-business",
    category: "technical",
    severity: "medium",
    weight: 2,
    score: businessSchema ? 1 : 0,
    issue: {
      title: "Missing business structured data (schema)",
      detail: "Your homepage does not describe your business to Google in a machine-readable way",
      fix: "Add LocalBusiness (or Organization) schema with your name, address, phone, opening hours and service area.",
      affected: [home?.path ?? "/"],
    },
  });
  checks.push({
    id: "schema-coverage",
    category: "technical",
    severity: "low",
    weight: 1,
    score: Math.min(1, schemaCoverage / 80),
    issue: {
      title: "Most pages have no structured data",
      detail: `Only ${schemaCoverage}% of pages carry schema markup`,
      fix: "Add Service, FAQPage and BreadcrumbList schema to your service and location pages.",
      affected: paths(content.filter((page) => page.schemaTypes.length === 0)),
    },
  });

  // ---------- Click depth and orphan pages ----------
  const buckets = [1, 2, 3, 4].map((depth) => html.filter((page) => page.depth === depth).length);
  buckets.push(html.filter((page) => (page.depth ?? 0) >= 5).length);
  const deepPages = content.filter((page) => (page.depth ?? 0) > auditConfig.maxClickDepth);
  const orphans = content.filter((page) => page.depth === null && !page.noindex);
  const depthRows: CheckRow[] = deepPages.length
    ? [
        { status: "fail", text: `${plural(deepPages.length, "page")} ${deepPages.length === 1 ? "is" : "are"} deeper than ${auditConfig.maxClickDepth} clicks` },
        ...deepPages.slice(0, 2).map((page): CheckRow => ({ status: "warn", path: page.path, text: ` is ${page.depth} clicks deep` })),
      ]
    : [{ status: "pass", text: `Every crawled page is within ${auditConfig.maxClickDepth} clicks of the homepage` }];
  if (orphans.length) depthRows.push({ status: "warn", text: `${plural(orphans.length, "page")} in the sitemap ${orphans.length === 1 ? "has" : "have"} no links pointing to ${orphans.length === 1 ? "it" : "them"}` });
  if (crawl.capped) depthRows.push({ status: "info", text: `This audit crawled the ${pages.length} pages closest to the homepage, so deeper pages may exist` });
  checks.push({
    id: "click-depth",
    category: "technical",
    severity: "low",
    weight: 1,
    score: ratioScore(deepPages.length, total),
    issue: {
      title: "Pages buried too deep in the website",
      detail: `${plural(deepPages.length, "page")} ${agree(deepPages.length, "takes", "take")} more than ${auditConfig.maxClickDepth} clicks to reach from the homepage`,
      fix: "Link to important pages from your menu, homepage or service overview pages.",
      affected: deepPages.map((page) => `${page.path} (${page.depth} clicks)`),
    },
  });
  checks.push({
    id: "orphan-pages",
    category: "onpage",
    severity: "medium",
    weight: 1.5,
    score: ratioScore(orphans.length, total),
    issue: {
      title: "Orphan pages with no internal links",
      detail: `${plural(orphans.length, "page")} can only be found through the sitemap. No other page links to ${orphans.length === 1 ? "it" : "them"}`,
      fix: "Add links to these pages from related pages, or remove them if they are no longer needed.",
      affected: paths(orphans),
    },
  });

  // ---------- Titles ----------
  const groupBy = (list: PageData[], key: (page: PageData) => string | null) => {
    const groups = new Map<string, PageData[]>();
    for (const page of list) {
      const value = key(page)?.toLowerCase();
      if (!value) continue;
      groups.set(value, [...(groups.get(value) ?? []), page]);
    }
    return [...groups.values()].filter((group) => group.length > 1).flat();
  };
  const titleMissing = indexable.filter((page) => !page.title);
  const titleShort = indexable.filter((page) => page.title && page.title.length < auditConfig.title.min);
  const titleLong = indexable.filter((page) => page.title && page.title.length > auditConfig.title.max);
  const titleDuplicate = groupBy(indexable, (page) => page.title);
  const titleIdeal = indexable.length - titleMissing.length - titleShort.length - titleLong.length;
  const titleAffected = new Set([...titleMissing, ...titleShort, ...titleLong, ...titleDuplicate]);
  const titleRows: CheckRow[] = [
    titleMissing.length ? { status: "fail", text: `Title tag missing on ${plural(titleMissing.length, "page")}` } : { status: "pass", text: "Every page has a title tag" },
    titleShort.length ? { status: "warn", text: `${plural(titleShort.length, "title")} ${titleShort.length === 1 ? "is" : "are"} shorter than ${auditConfig.title.min} characters` } : { status: "pass", text: "No titles are too short" },
    titleLong.length ? { status: "warn", text: `${plural(titleLong.length, "title")} ${titleLong.length === 1 ? "is" : "are"} over ${auditConfig.title.max} characters and may be cut off` } : { status: "pass", text: "No titles are too long" },
    titleDuplicate.length ? { status: "fail", text: `${plural(titleDuplicate.length, "page")} ${agree(titleDuplicate.length, "shares", "share")} a duplicate title` } : { status: "pass", text: "Every title is unique" },
  ];
  const indexTotal = Math.max(1, indexable.length);
  checks.push({
    id: "title-missing", category: "onpage", severity: "high", weight: 3, score: ratioScore(titleMissing.length, indexTotal),
    issue: { title: "Pages missing a title tag", detail: `${plural(titleMissing.length, "page")} ${agree(titleMissing.length, "has", "have")} no title, so Google has to invent one`, fix: "Write a unique title for each page that names the service and location, in 50 to 60 characters.", affected: paths(titleMissing) },
  });
  checks.push({
    id: "title-duplicate", category: "onpage", severity: "medium", weight: 2, score: ratioScore(titleDuplicate.length, indexTotal),
    issue: { title: "Duplicate title tags", detail: `${plural(titleDuplicate.length, "page")} ${agree(titleDuplicate.length, "shares", "share")} a title with another page, so they compete with each other`, fix: "Give every page its own title that describes what makes that page different.", affected: titleDuplicate.map((page) => `${page.path} ("${page.title}")`) },
  });
  checks.push({
    id: "title-length", category: "onpage", severity: "low", weight: 1, score: 1 - Math.min(1, (titleShort.length + titleLong.length) / indexTotal) * 0.8,
    issue: { title: "Titles that are too short or too long", detail: `${plural(titleShort.length + titleLong.length, "title")} ${agree(titleShort.length + titleLong.length, "falls", "fall")} outside ${auditConfig.title.min} to ${auditConfig.title.max} characters`, fix: "Short titles waste space in search results. Long ones get cut off. Aim for 50 to 60 characters.", affected: [...titleShort, ...titleLong].map((page) => `${page.path} (${page.title?.length} characters)`) },
  });

  // ---------- Meta descriptions ----------
  const metaMissing = indexable.filter((page) => !page.metaDescription);
  const metaDuplicate = groupBy(indexable, (page) => page.metaDescription);
  const metaWrong = indexable.filter(
    (page) =>
      page.metaDescription &&
      !metaDuplicate.includes(page) &&
      (page.metaDescription.length < auditConfig.metaDescription.min || page.metaDescription.length > auditConfig.metaDescription.max),
  );
  const metaGood = indexable.length - metaMissing.length - metaDuplicate.length - metaWrong.length;
  const metaRows: CheckRow[] = [
    metaMissing.length ? { status: "fail", text: `Meta description missing on ${plural(metaMissing.length, "page")}` } : { status: "pass", text: "Every page has a meta description" },
    metaDuplicate.length ? { status: "fail", text: `${plural(metaDuplicate.length, "page")} ${agree(metaDuplicate.length, "reuses", "reuse")} the same description` } : { status: "pass", text: "Every description is unique" },
    metaWrong.length ? { status: "warn", text: `${plural(metaWrong.length, "description")} ${metaWrong.length === 1 ? "is" : "are"} outside ${auditConfig.metaDescription.min} to ${auditConfig.metaDescription.max} characters` } : { status: "pass", text: "Description lengths are in the ideal range" },
    { status: "info", text: "Unique descriptions with a clear call to action get more clicks" },
  ];
  checks.push({
    id: "meta-missing", category: "onpage", severity: "high", weight: 2, score: ratioScore(metaMissing.length, indexTotal),
    issue: { title: "Pages missing a meta description", detail: `${plural(metaMissing.length, "page")} ${agree(metaMissing.length, "has", "have")} no description for search results`, fix: "Write a description for each page that says what you offer and gives a reason to click, in 140 to 160 characters.", affected: paths(metaMissing) },
  });
  checks.push({
    id: "meta-duplicate", category: "onpage", severity: "medium", weight: 1.5, score: ratioScore(metaDuplicate.length, indexTotal),
    issue: { title: "Duplicate meta descriptions", detail: `${plural(metaDuplicate.length, "page")} ${agree(metaDuplicate.length, "reuses", "reuse")} the same description`, fix: "Write a separate description for each page.", affected: paths(metaDuplicate) },
  });
  checks.push({
    id: "meta-length", category: "onpage", severity: "low", weight: 1, score: 1 - Math.min(1, metaWrong.length / indexTotal) * 0.8,
    issue: { title: "Meta descriptions with the wrong length", detail: `${plural(metaWrong.length, "description")} ${agree(metaWrong.length, "falls", "fall")} outside ${auditConfig.metaDescription.min} to ${auditConfig.metaDescription.max} characters`, fix: "Lengthen short descriptions and trim long ones so the full message shows in search results.", affected: metaWrong.map((page) => `${page.path} (${page.metaDescription?.length} characters)`) },
  });

  // ---------- Headings ----------
  const h1Missing = indexable.filter((page) => page.h1Count === 0);
  const h1Multiple = indexable.filter((page) => page.h1Count > 1);
  const headingRows: CheckRow[] = [
    h1Missing.length ? { status: "fail", text: `Main heading (H1) missing on ${plural(h1Missing.length, "page")}` } : { status: "pass", text: "Every page has a main heading (H1)" },
    h1Multiple.length ? { status: "warn", text: `${plural(h1Multiple.length, "page")} ${h1Multiple.length === 1 ? "has" : "have"} more than one H1` } : { status: "pass", text: "No pages have more than one H1" },
  ];
  checks.push({
    id: "h1", category: "onpage", severity: "medium", weight: 1.5, score: ratioScore(h1Missing.length + h1Multiple.length * 0.5, indexTotal),
    issue: { title: "Missing or multiple H1 headings", detail: `${plural(h1Missing.length, "page")} ${agree(h1Missing.length, "has", "have")} no main heading and ${h1Multiple.length} ${agree(h1Multiple.length, "has", "have")} more than one`, fix: "Give each page exactly one H1 that states what the page is about.", affected: [...h1Missing.map((page) => `${page.path} (no H1)`), ...h1Multiple.map((page) => `${page.path} (${page.h1Count} H1s)`)], count: h1Missing.length + h1Multiple.length },
  });

  // ---------- Images ----------
  const imageTotal = content.reduce((sum, page) => sum + page.imageCount, 0);
  const missingAlt = content.reduce((sum, page) => sum + page.imagesMissingAlt, 0);
  const duplicateAltOn = (page: PageData) => page.altTexts.length - new Set(page.altTexts).size;
  const duplicateAlt = content.reduce((sum, page) => sum + duplicateAltOn(page), 0);
  const imageRows: CheckRow[] = [
    missingAlt ? { status: "fail", text: `${plural(missingAlt, "image")} ${missingAlt === 1 ? "has" : "have"} no alt text` } : { status: "pass", text: imageTotal ? "Every image has alt text" : "No images found on the crawled pages" },
    duplicateAlt ? { status: "warn", text: `${plural(duplicateAlt, "image")} ${agree(duplicateAlt, "reuses", "reuse")} the same alt text as another image on the page` } : { status: "pass", text: "No duplicate alt text on the same page" },
  ];
  checks.push({
    id: "image-alt", category: "onpage", severity: "medium", weight: 1.5, score: ratioScore(missingAlt, imageTotal),
    issue: { title: "Images missing alt text", detail: `${plural(missingAlt, "image")} ${agree(missingAlt, "has", "have")} no description for Google or for screen readers`, fix: "Describe what each image shows in a few words, and mention the service where it is relevant.", affected: content.filter((page) => page.imagesMissingAlt > 0).map((page) => `${page.path} (${plural(page.imagesMissingAlt, "image")})`), count: missingAlt },
  });

  // ---------- Thin content ----------
  const thin = indexable.filter((page) => page.wordCount < auditConfig.thinContentWords);
  checks.push({
    id: "thin-content", category: "onpage", severity: "low", weight: 1, score: ratioScore(thin.length, indexTotal),
    issue: { title: "Thin pages with very little text", detail: `${plural(thin.length, "page")} ${agree(thin.length, "has", "have")} fewer than ${auditConfig.thinContentWords} words`, fix: "Expand these pages with useful detail: what the service includes, pricing guidance, areas served and common questions.", affected: thin.map((page) => `${page.path} (${page.wordCount} words)`) },
  });

  // ---------- Trust signals ----------
  const withText = (key: keyof PageData["text"]) => content.filter((page) => page.text[key]);
  const reviews = withText("reviews");
  const testimonials = withText("testimonials");
  const guarantee = withText("guarantee");
  const telPages = content.filter((page) => page.hasTelLink);
  const trustRows: CheckRow[] = [
    reviews.length === 0
      ? { status: "fail", text: "No customer reviews or ratings shown" }
      : reviews.length === 1 && reviews[0] === home && content.length > 1
        ? { status: "warn", text: "Customer reviews shown on the homepage only, not on service pages" }
        : { status: "pass", text: `Customer reviews or ratings mentioned on ${plural(reviews.length, "page")}` },
    testimonials.length ? { status: "pass", text: "Testimonials found" } : { status: "fail", text: "No testimonials found" },
    ratingPages.length ? { status: "pass", text: "Review markup found (AggregateRating schema)" } : { status: "fail", text: "No review markup (AggregateRating schema)" },
    withText("licences").length ? { status: "pass", text: "Licences, insurance or certifications mentioned" } : { status: "fail", text: "No licences, insurance or certifications shown" },
    telPages.length ? { status: "pass", text: "Phone number with click-to-call on mobile" } : { status: "fail", text: "No click-to-call phone link found" },
    guarantee.length === 0
      ? { status: "fail", text: "No guarantee or warranty mentioned" }
      : guarantee.length === 1 && content.length > 3
        ? { status: "warn", text: "Guarantee or warranty shown on 1 page only" }
        : { status: "pass", text: `Guarantee or warranty mentioned on ${plural(guarantee.length, "page")}` },
    withText("gallery").length ? { status: "pass", text: "Project gallery or before and after examples found" } : { status: "fail", text: "No before and after photos or project gallery" },
  ];
  const trustScore = trustRows.reduce((sum, row) => sum + (row.status === "pass" ? 1 : row.status === "warn" ? 0.5 : 0), 0) / trustRows.length;
  const trustGaps = trustRows.filter((row) => row.status !== "pass");
  checks.push({
    id: "trust-signals", category: "onpage", severity: "medium", weight: 1.5, score: trustScore,
    issue: { title: "Missing trust signals", detail: `${plural(trustGaps.length, "trust signal")} customers look for ${trustGaps.length === 1 ? "is" : "are"} missing or hard to find`, fix: "Show reviews, licences, guarantees and photos of your work on the pages where customers decide to call.", affected: trustGaps.map((row) => row.text) },
  });

  // ---------- Mobile ----------
  const noViewport = content.filter((page) => !page.hasViewport);
  const mobileRows: CheckRow[] = [
    noViewport.length ? { status: "fail", text: `${plural(noViewport.length, "page")} ${noViewport.length === 1 ? "is" : "are"} not set up for phone screens (no viewport tag)` } : { status: "pass", text: "Every page is set up for phone screens" },
    telPages.length ? { status: "pass", text: "Visitors can tap your phone number to call" } : { status: "warn", text: "No tap-to-call phone link found" },
  ];
  if (cwv.available && cwv.performanceScore !== null) {
    mobileRows.push({ status: cwv.performanceScore >= 90 ? "pass" : cwv.performanceScore >= 50 ? "warn" : "fail", text: `Mobile speed score: ${cwv.performanceScore} out of 100` });
  }
  checks.push({
    id: "mobile-viewport", category: "mobile", severity: "high", weight: 3, score: ratioScore(noViewport.length, total),
    issue: { title: "Pages not set up for mobile screens", detail: `${plural(noViewport.length, "page")} ${agree(noViewport.length, "has", "have")} no viewport tag, so phones show a tiny desktop layout`, fix: "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> to the head of every page.", affected: paths(noViewport) },
  });
  checks.push({
    id: "mobile-tap-to-call", category: "mobile", severity: "low", weight: 1, score: telPages.length ? 1 : 0,
    issue: { title: "No tap-to-call phone link", detail: "Mobile visitors cannot call you with one tap", fix: "Link your phone number with tel: so a tap starts a call.", affected: [home?.path ?? "/"] },
  });
  if (cwv.available && cwv.performanceScore !== null) {
    checks.push({ id: "mobile-speed", category: "mobile", severity: "medium", weight: 2, score: cwv.performanceScore / 100 });
  }

  // ---------- Security ----------
  const https = crawl.origin.startsWith("https:");
  const httpVariants = crawl.variants.filter((variant) => variant.url.startsWith("http://") && variant.status !== null);
  const httpRedirects = httpVariants.length > 0 && httpVariants.every((variant) => variant.status !== null && variant.status >= 300 && variant.status < 400);
  const hsts = Boolean(crawl.homeHeaders["strict-transport-security"]);
  const nosniff = /nosniff/i.test(crawl.homeHeaders["x-content-type-options"] ?? "");
  const mixed = content.filter((page) => page.mixedContent > 0);
  const securityRows: CheckRow[] = [
    https ? { status: "pass", text: "Website loads over secure HTTPS" } : { status: "fail", text: "Website does not use HTTPS. Browsers show a \"Not secure\" warning" },
    !https ? { status: "info", text: "Fix HTTPS first, then redirect http to https" } : httpRedirects || httpVariants.length === 0 ? { status: "pass", text: "http addresses redirect to https" } : { status: "fail", text: "http addresses do not all redirect to https" },
    mixed.length ? { status: "fail", text: `${plural(mixed.length, "page")} load insecure (http) files on a secure page` } : { status: "pass", text: "No insecure files loaded on secure pages" },
    hsts ? { status: "pass", text: "Browsers are told to always use HTTPS (HSTS)" } : { status: "warn", text: "HSTS header is not set" },
    nosniff ? { status: "pass", text: "Content type protection header is set" } : { status: "warn", text: "X-Content-Type-Options header is not set" },
  ];
  checks.push({
    id: "https", category: "security", severity: "critical", weight: 4, score: https ? 1 : 0,
    issue: { title: "Website does not use HTTPS", detail: "Browsers mark the website as \"Not secure\", and Google ranks secure websites higher", fix: "Install an SSL certificate (free from Let's Encrypt or your host) and redirect all traffic to https.", affected: [crawl.origin] },
  });
  checks.push({
    id: "http-redirect", category: "security", severity: "high", weight: 2, score: !https || httpRedirects || httpVariants.length === 0 ? 1 : 0,
    issue: { title: "http addresses do not redirect to https", detail: "Visitors and links using the old http address stay on an insecure version", fix: "Add a permanent (301) redirect from http to https for the whole website.", affected: httpVariants.filter((variant) => !(variant.status !== null && variant.status >= 300 && variant.status < 400)).map((variant) => variant.url) },
  });
  checks.push({
    id: "mixed-content", category: "security", severity: "medium", weight: 2, score: ratioScore(mixed.length, total),
    issue: { title: "Insecure files on secure pages", detail: `${plural(mixed.length, "page")} load images or scripts over http, which browsers may block`, fix: "Change these file addresses to https.", affected: mixed.map((page) => `${page.path} (${plural(page.mixedContent, "file")})`) },
  });
  checks.push({
    id: "security-headers", category: "security", severity: "low", weight: 1, score: (Number(hsts) + Number(nosniff)) / 2,
    issue: { title: "Recommended security headers are missing", detail: [!hsts ? "HSTS" : null, !nosniff ? "X-Content-Type-Options" : null].filter(Boolean).join(" and ") + " not set", fix: "Ask your host or developer to add these response headers. They take a few minutes to set up.", affected: [!hsts ? "Strict-Transport-Security" : null, !nosniff ? "X-Content-Type-Options" : null].filter((v): v is string => v !== null) },
  });

  // ---------- AI search ----------
  const answerPages = content.filter((page) => hasType(page, (type) => type === "FAQPage") || page.questionHeadings >= 2);
  const aboutOrContact = content.some((page) => /\/(?:about|contact)/i.test(page.path));
  const aiRows: CheckRow[] = [
    aiBlocked.length ? { status: "warn", text: `${aiBlocked.join(", ")} blocked in robots.txt` } : { status: "pass", text: "AI assistants are allowed to read your website" },
    businessSchema ? { status: "pass", text: "Business details are marked up for machines (schema)" } : { status: "fail", text: "No business schema for AI assistants to rely on" },
    answerPages.length ? { status: "pass", text: `${plural(answerPages.length, "page")} ${answerPages.length === 1 ? "has" : "have"} question-and-answer content` } : { status: "fail", text: "No FAQ sections or direct answers that AI assistants can quote" },
    ratingPages.length ? { status: "pass", text: "Review ratings are marked up" } : { status: "warn", text: "Review ratings are not marked up" },
    aboutOrContact ? { status: "pass", text: "About or contact page found" } : { status: "warn", text: "No about or contact page found among the crawled pages" },
  ];
  checks.push({
    id: "ai-crawlers", category: "ai", severity: "medium", weight: 2, score: aiBlocked.length ? 1 - aiBlocked.length / AI_CRAWLERS.length : 1,
    issue: { title: "AI crawlers are blocked", detail: `${aiBlocked.join(", ")} cannot read your website, so those assistants cannot recommend you from it`, fix: "Remove the Disallow rules for these crawlers in robots.txt, unless you blocked them on purpose.", affected: aiBlocked.map(String) },
  });
  checks.push({
    id: "ai-answers", category: "ai", severity: "medium", weight: 3, score: answerPages.length ? Math.min(1, 0.6 + (answerPages.length / total) * 2) : 0,
    issue: { title: "No answer-ready content for AI search", detail: "Key pages lack FAQ sections and direct answers that AI assistants can quote", fix: "Add a short FAQ to each service page that answers the questions customers ask, and mark it up with FAQPage schema.", affected: paths(content.filter((page) => !answerPages.includes(page))) , count: 1 },
  });
  checks.push({ id: "ai-schema", category: "ai", severity: "medium", weight: 2, score: businessSchema ? 1 : 0 });
  checks.push({ id: "ai-reviews", category: "ai", severity: "low", weight: 1, score: ratingPages.length ? 1 : 0 });
  checks.push({ id: "ai-about", category: "ai", severity: "low", weight: 1, score: aboutOrContact ? 1 : 0 });

  // ---------- Speed ----------
  if (cwv.available && cwv.lcpMs !== null && cwv.cls !== null) {
    const lcpPoor = cwv.lcpMs > 4000;
    const slow = cwv.lcpMs > 2500;
    const derived = cwv.lcpMs <= 2500 ? 0.9 : cwv.lcpMs <= 4000 ? 0.6 : 0.3;
    checks.push({
      id: "speed-loading", category: "speed", severity: lcpPoor ? "high" : "medium", weight: 3,
      score: slow
        ? Math.min((cwv.performanceScore ?? derived * 100) / 100, 0.85)
        : (cwv.performanceScore ?? derived * 100) / 100,
      issue: slow
        ? { title: "Slow mobile loading", detail: `The main content takes ${(cwv.lcpMs / 1000).toFixed(1)}s to appear on a phone. Google's target is 2.5s or less`, fix: "Compress and resize large images, load scripts later, and use caching or a CDN.", affected: [home?.path ?? "/"] }
        : undefined,
    });
    const clsBad = cwv.cls > 0.1;
    checks.push({
      id: "speed-stability", category: "speed", severity: cwv.cls > 0.25 ? "high" : "medium", weight: 1, score: cwv.cls <= 0.1 ? 1 : cwv.cls <= 0.25 ? 0.5 : 0,
      issue: clsBad ? { title: "Page layout shifts while loading", detail: `Layout shift score is ${cwv.cls}. Google's target is 0.1 or less`, fix: "Set width and height on images and embeds, and reserve space for banners and ads.", affected: [home?.path ?? "/"] } : undefined,
    });
    if (cwv.inpMs !== null) {
      checks.push({
        id: "speed-response", category: "speed", severity: cwv.inpMs > 500 ? "high" : "medium", weight: 1, score: cwv.inpMs <= 200 ? 1 : cwv.inpMs <= 500 ? 0.5 : 0,
        issue: cwv.inpMs > 200 ? { title: "Pages respond slowly to taps", detail: `Pages take ${cwv.inpMs}ms to react. Google's target is 200ms or less`, fix: "Reduce heavy JavaScript and third-party scripts.", affected: [home?.path ?? "/"] } : undefined,
      });
    }
  }

  // ---------- Issues and scores ----------
  const issues: Issue[] = checks
    .filter((check) => check.score < 1 && check.issue)
    .map((check) => {
      const issue = check.issue!;
      const affected = issue.affected.slice(0, auditConfig.maxExamplesStored);
      return {
        id: check.id,
        category: check.category,
        severity: check.severity,
        title: issue.title,
        detail: issue.detail,
        fix: issue.fix,
        count: issue.count ?? issue.affected.length,
        affected,
      };
    })
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || b.count - a.count);
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 } as Record<Severity, number>;
  for (const issue of issues) severityCounts[issue.severity] += 1;

  const categories = categoryScores(checks);
  const overall = overallScore(categories);

  // ---------- Page health ----------
  const pageHasWarning = (page: PageData) =>
    titleAffected.has(page) || metaMissing.includes(page) || metaDuplicate.includes(page) || h1Missing.includes(page) || page.imagesMissingAlt > 0 || !page.hasViewport;
  const errorPages = broken.length + noindexPages.length;
  const warningPages = content.filter((page) => !page.noindex && pageHasWarning(page)).length;
  const healthBase = Math.max(1, content.length + broken.length);
  const missingTitleOrMeta = new Set([...titleMissing, ...metaMissing]).size;

  // ---------- Headline ----------
  const facts: string[] = [];
  if (siteBlocked) facts.push("your whole website is blocked from Google");
  else if (notIndexable) facts.push(`${plural(notIndexable, "important page")} ${notIndexable === 1 ? "is" : "are"} hidden from Google`);
  if (broken.length) facts.push(`${plural(broken.length, "page")} ${broken.length === 1 ? "sends" : "send"} visitors to errors`);
  if (missingTitleOrMeta) facts.push(`${plural(missingTitleOrMeta, "page")} ${missingTitleOrMeta === 1 ? "has" : "have"} no title or description for search results`);
  if (cwv.available && cwv.lcpMs !== null && cwv.lcpMs > 2500) facts.push("mobile pages load slowly");
  if (!https) facts.push("the website is not secure");
  const sentence = facts.length > 1 ? `${facts.slice(0, -1).join(", ")}, and ${facts[facts.length - 1]}` : facts[0] ?? "";
  const headline = facts.length
    ? `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}. Fixing ${facts.length === 1 ? "this" : "these"} is the fastest way to get found by more customers.`
    : issues.length
      ? `No critical problems found. ${plural(issues.length, "smaller issue")} can still be improved to help you rank higher.`
      : "No problems found on the pages we crawled.";

  return {
    version: 1,
    site: { inputUrl: crawl.inputUrl, finalUrl: crawl.finalUrl, origin: crawl.origin, host: crawl.host, platform: crawl.platform },
    crawl: {
      pagesCrawled: pages.length,
      htmlPages: html.length,
      pageCap: auditConfig.pageCap,
      capped: crawl.capped,
      durationMs: crawl.durationMs,
      finishedAt: new Date().toISOString(),
    },
    scores: { overall, label: scoreLabel(overall), categories, estimatedAfterFixes: Math.max(overall, estimateAfterFixes(checks)) },
    severityCounts,
    issueTotal: issues.length,
    issues,
    headline,
    pageHealth: {
      healthy: Math.max(0, healthBase - errorPages - warningPages),
      warnings: warningPages,
      errors: errorPages,
      brokenPages: broken.length,
      missingTitleOrMeta,
      notIndexable,
    },
    cwv,
    robots: { found: crawl.robots.found, issueCount: problemRows(robotsRows), rows: robotsRows, suggested: suggested.join("\n") },
    sitemap: {
      found: crawl.sitemap.found,
      url: crawl.sitemap.url,
      total: sitemapSet.size,
      checked: sitemapChecked.length,
      valid: sitemapChecked.length - sitemapInvalid.length,
      invalid: sitemapInvalid.length,
      missingIndexable: missingFromSitemap.length,
      duplicates: sitemapDuplicates,
      issueCount: problemRows(sitemapRows),
      rows: sitemapRows,
      indexableUrls: indexable.map((page) => page.url),
    },
    statusCodes: { ok: count2, redirect: redirects.length, clientError: notFound.length, serverError: serverErrors.length, rows: statusRows },
    canonical: { present: content.length - canonicalMissing.length, missing: canonicalMissing.length, issueCount: problemRows(canonicalRows), rows: canonicalRows },
    domainVariants: { preferred: crawl.origin, variants: crawl.variants, issueCount: variantProblems.length },
    schema: { coveragePct: schemaCoverage, missingCount: schemaRows.filter((row) => row.status === "missing").length, rows: schemaRows },
    clickDepth: { buckets, deepCount: deepPages.length, rows: depthRows },
    titles: { missing: titleMissing.length, short: titleShort.length, ideal: Math.max(0, titleIdeal), long: titleLong.length, duplicate: titleDuplicate.length, affected: titleAffected.size, rows: [...titleRows, ...headingRows] },
    metas: { missing: metaMissing.length, duplicate: metaDuplicate.length, wrongLength: metaWrong.length, good: Math.max(0, metaGood), affected: metaMissing.length + metaDuplicate.length + metaWrong.length, rows: metaRows },
    images: { total: imageTotal, missingAlt, duplicateAlt, good: Math.max(0, imageTotal - missingAlt - duplicateAlt), rows: imageRows },
    trust: { scorePct: Math.round(trustScore * 100), gaps: trustGaps.length, rows: trustRows },
    mobile: { rows: mobileRows },
    security: { rows: securityRows },
    ai: { rows: aiRows },
  };
}
