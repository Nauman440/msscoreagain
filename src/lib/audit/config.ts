/** Tunable limits for the audit engine. All can be overridden by environment variables. */

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export const auditConfig = {
  /** Most pages a free audit will crawl. */
  pageCap: intEnv("AUDIT_PAGE_CAP", 50),
  /** The crawl stops starting new pages after this long, so the report arrives in about a minute. */
  crawlBudgetMs: intEnv("AUDIT_CRAWL_BUDGET_MS", 40_000),
  /** Requests in flight at once against the audited site. */
  concurrency: intEnv("AUDIT_CONCURRENCY", 6),
  /** Per-request timeout. */
  requestTimeoutMs: intEnv("AUDIT_REQUEST_TIMEOUT_MS", 10_000),
  /** HTML larger than this is cut off before parsing. */
  maxHtmlBytes: 2_000_000,
  /** Most URLs read from the sitemap files. */
  maxSitemapUrls: 5_000,
  /** A finished audit for the same site is reused for this many days (0 turns reuse off). */
  reuseDays: intEnv("AUDIT_REUSE_DAYS", 30),
  /** Audits one visitor (IP address) may start per hour. */
  perIpPerHour: intEnv("AUDIT_RATE_LIMIT_PER_HOUR", 10),
  /** Audits running at the same time in this server process. */
  maxConcurrentAudits: intEnv("AUDIT_MAX_CONCURRENT", 3),
  /** Affected pages shown per issue before the visitor gives an email. */
  previewExamples: 3,
  /** Most affected pages stored per issue. */
  maxExamplesStored: 200,
  userAgent: "Mozilla/5.0 (compatible; MSScoreBot/1.0; +https://msscore.com/bot)",
  userAgentToken: "msscorebot",
  /** Thresholds from the report design. */
  title: { min: 50, max: 60 },
  metaDescription: { min: 140, max: 160 },
  thinContentWords: 200,
  maxClickDepth: 3,
} as const;

/** Assistants and AI search crawlers checked in robots.txt. */
export const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "PerplexityBot",
  "Google-Extended",
  "CCBot",
] as const;
