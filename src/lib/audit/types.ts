export type Severity = "critical" | "high" | "medium" | "low";
export type Category = "technical" | "onpage" | "speed" | "mobile" | "security" | "ai";
export type RowStatus = "pass" | "fail" | "warn" | "info";

export const CATEGORY_LABELS: Record<Category, string> = {
  technical: "Technical SEO",
  onpage: "On-page SEO",
  speed: "Speed and Core Web Vitals",
  mobile: "Mobile",
  security: "Security",
  ai: "AI search readiness",
};

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

/** One line in a check list: a badge, an optional path in monospace, and text. */
export interface CheckRow {
  status: RowStatus;
  text: string;
  path?: string;
}

/** A problem found by the audit. `affected` lists the pages (or items) it applies to. */
export interface Issue {
  id: string;
  category: Category;
  severity: Severity;
  title: string;
  detail: string;
  /** How to fix it, in plain language. */
  fix: string;
  count: number;
  affected: string[];
  /** True when `affected` was shortened for a visitor who has not unlocked the full report. */
  truncated?: boolean;
}

/** What the crawler recorded for one URL. */
export interface PageData {
  url: string;
  path: string;
  status: number;
  /** Click depth from the homepage. Null when the page was only found through the sitemap. */
  depth: number | null;
  redirectTo?: string;
  error?: string;
  isHtml: boolean;
  fetchMs: number;
  bytes: number;
  headers: Record<string, string>;
  title: string | null;
  metaDescription: string | null;
  noindex: boolean;
  canonical: string | null;
  h1Count: number;
  wordCount: number;
  hasViewport: boolean;
  imageCount: number;
  imagesMissingAlt: number;
  altTexts: string[];
  schemaTypes: string[];
  questionHeadings: number;
  hasTelLink: boolean;
  mixedContent: number;
  links: string[];
  text: TrustText;
}

/** Trust wording spotted in the visible text of a page. */
export interface TrustText {
  reviews: boolean;
  testimonials: boolean;
  licences: boolean;
  guarantee: boolean;
  gallery: boolean;
}

export interface CoreWebVitals {
  available: boolean;
  /** "field" = real visitor data from Chrome, "lab" = a single test run. */
  source: "field" | "lab" | null;
  performanceScore: number | null;
  lcpMs: number | null;
  inpMs: number | null;
  /** Total blocking time, the lab stand-in when no INP field data exists. */
  tbtMs: number | null;
  cls: number | null;
  note: string;
}

export interface DomainVariant {
  url: string;
  status: number | null;
  ok: boolean;
  note: string;
}

export interface SchemaRow {
  status: "found" | "missing" | "partial";
  scope: string;
  type: string;
}

export interface AuditResult {
  version: 1;
  site: { inputUrl: string; finalUrl: string; origin: string; host: string };
  crawl: {
    pagesCrawled: number;
    htmlPages: number;
    pageCap: number;
    /** True when the site has more pages than the audit crawled. */
    capped: boolean;
    durationMs: number;
    finishedAt: string;
  };
  scores: {
    overall: number;
    label: string;
    categories: Record<Category, number | null>;
    estimatedAfterFixes: number;
  };
  severityCounts: Record<Severity, number>;
  issueTotal: number;
  issues: Issue[];
  headline: string;
  pageHealth: {
    healthy: number;
    warnings: number;
    errors: number;
    brokenPages: number;
    missingTitleOrMeta: number;
    notIndexable: number;
  };
  cwv: CoreWebVitals;
  robots: { found: boolean; issueCount: number; rows: CheckRow[]; suggested: string };
  sitemap: {
    found: boolean;
    url: string | null;
    total: number;
    checked: number;
    valid: number;
    invalid: number;
    missingIndexable: number;
    duplicates: number;
    issueCount: number;
    rows: CheckRow[];
    /** Indexable pages found by the crawl, used to generate a corrected sitemap. */
    indexableUrls: string[];
  };
  statusCodes: { ok: number; redirect: number; clientError: number; serverError: number; rows: CheckRow[] };
  canonical: { present: number; missing: number; issueCount: number; rows: CheckRow[] };
  domainVariants: { preferred: string; variants: DomainVariant[]; issueCount: number };
  schema: { coveragePct: number; missingCount: number; rows: SchemaRow[] };
  clickDepth: { buckets: number[]; deepCount: number; rows: CheckRow[] };
  titles: {
    missing: number;
    short: number;
    ideal: number;
    long: number;
    duplicate: number;
    affected: number;
    rows: CheckRow[];
  };
  metas: {
    missing: number;
    duplicate: number;
    wrongLength: number;
    good: number;
    affected: number;
    rows: CheckRow[];
  };
  images: { total: number; missingAlt: number; duplicateAlt: number; good: number; rows: CheckRow[] };
  trust: { scorePct: number; gaps: number; rows: CheckRow[] };
  mobile: { rows: CheckRow[] };
  security: { rows: CheckRow[] };
  ai: { rows: CheckRow[] };
}

export type AuditStatus = "queued" | "running" | "done" | "failed";

export interface AuditProgress {
  stage: string;
  pagesCrawled: number;
  pageCap: number;
}

export interface AuditRecord {
  id: string;
  host: string;
  inputUrl: string;
  status: AuditStatus;
  progress: AuditProgress;
  result: AuditResult | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Lead {
  auditId: string;
  email: string;
  unlockToken: string;
  createdAt: string;
}
