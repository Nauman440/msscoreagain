import type { ReactNode } from "react";
import { signupHref } from "@/lib/plans";
import { CATEGORY_LABELS, SEVERITY_ORDER, type AuditResult, type Category, type Issue, type Severity } from "@/lib/audit/types";
import EmailCapture from "./EmailCapture";
import {
  BarList,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  Check,
  Chip,
  colors,
  Donut,
  FixBand,
  Grid,
  issueChip,
  Legend,
  mono,
  primaryButton,
  Rows,
  ScoreGauge,
  scoreColor,
  secondaryButton,
  SectionHeading,
  SEVERITY_COLOR,
  SEVERITY_TONE,
  StackBar,
  Stat,
  StatGrid,
} from "./ui";

const SEVERITY_LABEL: Record<Severity, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
const n = (value: number) => value.toLocaleString("en");
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : 0);

function vitalStatus(value: number | null, good: number, poor: number): { label: string; tone: "green" | "orange" | "red" } | null {
  if (value === null) return null;
  if (value <= good) return { label: "Good", tone: "green" };
  if (value <= poor) return { label: "Needs work", tone: "orange" };
  return { label: "Poor", tone: "red" };
}

function Vital({ name, value, status }: { name: string; value: string; status: ReturnType<typeof vitalStatus> }) {
  return (
    <div style={{ border: "1px solid #E2E8F0", borderRadius: "12px", padding: "14px", display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }}>
      <div style={{ fontSize: "12px", color: colors.muted }}>{name}</div>
      <div style={{ fontSize: "24px", fontWeight: 800 }}>{value}</div>
      {status ? <Chip tone={status.tone} style={{ alignSelf: "flex-start", padding: "2px 8px", fontWeight: 600 }}>{status.label}</Chip> : null}
    </div>
  );
}

function IssueRow({ issue }: { issue: Issue }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 0", borderTop: "1px solid #E2E8F0", flexWrap: "wrap" }}>
      <Chip tone={SEVERITY_TONE[issue.severity]} style={{ minWidth: "60px", textAlign: "center" }}>
        {SEVERITY_LABEL[issue.severity]}
      </Chip>
      <div style={{ flex: 1, minWidth: "min(220px, 100%)" }}>
        <div style={{ fontWeight: 600, fontSize: "15px" }}>{issue.title}</div>
        <div style={{ fontSize: "13px", color: colors.muted }}>{issue.detail}</div>
      </div>
      <div style={{ fontSize: "13px", color: colors.muted }}>{CATEGORY_LABELS[issue.category]}</div>
    </div>
  );
}

function IssueDetails({ issue, unlocked }: { issue: Issue; unlocked: boolean }) {
  const hidden = issue.count - issue.affected.length;
  return (
    <details style={{ borderTop: "1px solid #E2E8F0", padding: "14px 0" }}>
      <summary style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", listStyle: "none" }}>
        <Chip tone={SEVERITY_TONE[issue.severity]} style={{ minWidth: "60px", textAlign: "center" }}>
          {SEVERITY_LABEL[issue.severity]}
        </Chip>
        <span style={{ flex: 1, minWidth: "min(220px, 100%)" }}>
          <span style={{ display: "block", fontWeight: 600, fontSize: "15px" }}>{issue.title}</span>
          <span style={{ display: "block", fontSize: "13px", color: colors.muted }}>{issue.detail}</span>
        </span>
        <span style={{ fontSize: "13px", color: "#1D4ED8", fontWeight: 600 }}>Show details</span>
      </summary>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "12px 0 0 74px", fontSize: "14px" }}>
        <div>
          <strong>How to fix it: </strong>
          {issue.fix}
        </div>
        {issue.affected.length ? (
          <div>
            <strong>Affected ({n(issue.count)}):</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "4px" }}>
              {issue.affected.map((item) => (
                <li key={item} style={{ ...mono, overflowWrap: "anywhere" }}>
                  {item}
                </li>
              ))}
            </ul>
            {hidden > 0 ? (
              <div style={{ marginTop: "6px", fontSize: "13px", color: colors.muted }}>
                {unlocked ? `And ${n(hidden)} more.` : <>And {n(hidden)} more. <a href="#full-report">Unlock the full report</a> to see every page.</>}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </details>
  );
}

function PlanCard({ name, price, unit, text, features, action, featured, outline, href }: {
  href: string;
  name: string;
  price: string;
  unit: string;
  text: string;
  features: string[];
  action: string;
  featured?: boolean;
  outline?: boolean;
}) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: featured ? "2px solid #2563EB" : "1px solid #E2E8F0",
        borderRadius: "16px",
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      {featured ? (
        <span style={{ alignSelf: "flex-start", background: "#2563EB", color: "#FFFFFF", fontSize: "12px", fontWeight: 700, padding: "3px 10px", borderRadius: "6px" }}>
          Most popular
        </span>
      ) : null}
      <div style={{ fontSize: "18px", fontWeight: 800 }}>{name}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
        <span style={{ fontSize: "34px", fontWeight: 800, letterSpacing: "-0.02em" }}>{price}</span>
        <span style={{ fontSize: "14px", color: colors.muted }}>{unit}</span>
      </div>
      <div style={{ fontSize: "14px", color: colors.muted }}>{text}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {features.map((feature) => (
          <div key={feature} style={{ display: "flex", gap: "10px", fontSize: "14px", alignItems: "flex-start" }}>
            <Check />
            <span>{feature}</span>
          </div>
        ))}
      </div>
      <a href={href} style={{ ...(outline ? secondaryButton : primaryButton), marginTop: "auto", ...(outline ? {} : { color: "#FFFFFF" }) }}>
        {action}
      </a>
    </div>
  );
}

function Mini({ title, chip, children }: { title: string; chip: { chip: string; tone: Parameters<typeof Chip>[0]["tone"] }; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} chip={chip.chip} tone={chip.tone} />
      {children}
    </Card>
  );
}

export default function Report({ id, result, unlocked, onUnlock }: {
  id: string;
  result: AuditResult;
  unlocked: boolean;
  onUnlock: (result: AuditResult) => void;
}) {
  const r = result;
  const crawled = r.crawl.pagesCrawled;
  const fixable = r.pageHealth.brokenPages + r.canonical.issueCount + r.domainVariants.issueCount;
  const categories = Object.entries(r.scores.categories) as [Category, number | null][];
  const severitySegments = SEVERITY_ORDER.map((severity) => ({
    label: SEVERITY_LABEL[severity],
    value: r.severityCounts[severity],
    color: SEVERITY_COLOR[severity],
  }));
  const urgent = r.severityCounts.critical + r.severityCounts.high;
  const healthTotal = r.pageHealth.healthy + r.pageHealth.warnings + r.pageHealth.errors;
  const lcp = r.cwv.lcpMs;
  const showInp = r.cwv.inpMs !== null;
  const afterHeight = Math.max(8, r.scores.estimatedAfterFixes * 1.3);
  const todayHeight = Math.max(8, r.scores.overall * 1.3);
  const statusTotal = r.statusCodes.ok + r.statusCodes.redirect + r.statusCodes.clientError + r.statusCodes.serverError;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Headline */}
      {urgent > 0 ? (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "16px", padding: "24px", display: "flex", gap: "20px", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ flex: 1, minWidth: "min(260px, 100%)", display: "flex", flexDirection: "column", gap: "8px" }}>
            <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 800, color: "#7F1D1D" }}>Your website may be turning customers away</h2>
            <div style={{ fontSize: "14px", color: "#450A0A" }}>{r.headline}</div>
          </div>
          <a href="#top-issues" style={{ ...primaryButton, background: "#B91C1C", color: "#FFFFFF" }}>
            See how to fix these
          </a>
        </div>
      ) : (
        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: "16px", padding: "24px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 800, color: "#14532D" }}>Your website is in good shape</h2>
          <div style={{ fontSize: "14px", color: "#052E16" }}>{r.headline}</div>
        </div>
      )}

      {/* Scores */}
      <Grid min={300}>
        <Card style={{ alignItems: "center", gap: "12px" }}>
          <div style={{ alignSelf: "flex-start" }}>
            <CardTitle>Overall SEO health</CardTitle>
          </div>
          <ScoreGauge score={r.scores.overall} label={r.scores.label} />
          <div style={{ fontSize: "13px", color: colors.muted, textAlign: "center" }}>
            {n(r.issueTotal)} {r.issueTotal === 1 ? "issue" : "issues"} found across {n(crawled)} pages.
            {urgent ? ` ${urgent} need fixing now.` : ""}
          </div>
        </Card>
        <Card>
          <CardTitle>Score by category</CardTitle>
          {categories.map(([category, score]) => (
            <div key={category} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                <span>{CATEGORY_LABELS[category]}</span>
                <strong>{score === null ? "Not measured" : `${score}%`}</strong>
              </div>
              <div style={{ height: "10px", background: colors.track, borderRadius: "6px" }}>
                {score !== null ? <div style={{ width: `${score}%`, height: "10px", background: scoreColor(score), borderRadius: "6px" }} /> : null}
              </div>
            </div>
          ))}
        </Card>
        <Card style={{ alignItems: "center", gap: "12px" }}>
          <div style={{ alignSelf: "flex-start" }}>
            <CardTitle>Issues by severity</CardTitle>
          </div>
          <Donut
            segments={severitySegments}
            centre={n(r.issueTotal)}
            caption={r.issueTotal === 1 ? "issue" : "issues"}
            label={`${r.issueTotal} issues: ${severitySegments.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(", ")}`}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 20px", fontSize: "13px", width: "100%" }}>
            {severitySegments.map((segment) => (
              <div key={segment.label} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "3px", background: segment.color }} />
                {segment.label} <strong>{segment.value}</strong>
              </div>
            ))}
          </div>
        </Card>
      </Grid>

      {/* Page health and Core Web Vitals */}
      <Grid>
        <Card style={{ gap: "16px" }}>
          <CardTitle>Page health ({n(crawled)} pages crawled)</CardTitle>
          <StackBar
            label={`${pct(r.pageHealth.healthy, healthTotal)} percent healthy, ${pct(r.pageHealth.warnings, healthTotal)} percent with warnings, ${pct(r.pageHealth.errors, healthTotal)} percent with errors`}
            segments={[
              { label: "Healthy", value: r.pageHealth.healthy, color: colors.green },
              { label: "Warnings", value: r.pageHealth.warnings, color: colors.yellow },
              { label: "Errors", value: r.pageHealth.errors, color: colors.red },
            ]}
            legend={false}
          />
          <Legend
            format={(value) => `${pct(value, healthTotal)}%`}
            segments={[
              { label: "Healthy", value: r.pageHealth.healthy, color: colors.green },
              { label: "Warnings", value: r.pageHealth.warnings, color: colors.yellow },
              { label: "Errors", value: r.pageHealth.errors, color: colors.red },
            ]}
          />
          <StatGrid>
            <Stat value={n(r.pageHealth.brokenPages)} label="Broken pages" />
            <Stat value={n(r.pageHealth.missingTitleOrMeta)} label="Missing titles or meta" />
            <Stat value={n(r.pageHealth.notIndexable)} label="Not indexable" />
          </StatGrid>
        </Card>
        <Card style={{ gap: "16px" }}>
          <CardTitle>Core Web Vitals (mobile)</CardTitle>
          {r.cwv.available ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px" }}>
                <Vital name="Loading (LCP)" value={lcp !== null ? `${(lcp / 1000).toFixed(1)}s` : "n/a"} status={vitalStatus(lcp, 2500, 4000)} />
                {showInp ? (
                  <Vital name="Response (INP)" value={`${r.cwv.inpMs}ms`} status={vitalStatus(r.cwv.inpMs, 200, 500)} />
                ) : (
                  <Vital name="Blocking time (TBT)" value={r.cwv.tbtMs !== null ? `${r.cwv.tbtMs}ms` : "n/a"} status={vitalStatus(r.cwv.tbtMs, 200, 600)} />
                )}
                <Vital name="Stability (CLS)" value={r.cwv.cls !== null ? r.cwv.cls.toFixed(2) : "n/a"} status={vitalStatus(r.cwv.cls, 0.1, 0.25)} />
              </div>
              <div style={{ fontSize: "13px", color: colors.muted }}>{r.cwv.note}</div>
            </>
          ) : (
            <div style={{ fontSize: "14px", color: colors.muted }}>{r.cwv.note}</div>
          )}
        </Card>
      </Grid>

      {/* Top issues */}
      <Card id="top-issues" style={{ gap: "16px", scrollMarginTop: "16px" }}>
        <CardTitle>Top issues to fix first</CardTitle>
        {r.issues.length ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {r.issues.slice(0, 5).map((issue) => (
              <IssueRow key={issue.id} issue={issue} />
            ))}
          </div>
        ) : (
          <div style={{ fontSize: "14px", color: colors.muted }}>No issues found on the pages we crawled.</div>
        )}
      </Card>

      {/* robots.txt and sitemap */}
      <Grid>
        <Card>
          <CardHeader title="robots.txt" {...issueChip(r.robots.issueCount)} />
          <Rows rows={r.robots.rows} />
          <div style={{ fontSize: "13px", fontWeight: 600, color: colors.label }}>Suggested robots.txt</div>
          <pre style={{ margin: 0, background: "#0F172A", color: "#E2E8F0", borderRadius: "10px", padding: "14px", fontSize: "12px", lineHeight: 1.6, overflowX: "auto", fontFamily: "ui-monospace, Menlo, Consolas, monospace" }}>
            {r.robots.suggested}
          </pre>
          <div style={{ fontSize: "12px", color: colors.muted }}>
            Review before uploading. A wrong robots.txt can remove pages from search, so changes always need approval.
          </div>
        </Card>
        <Card>
          <CardHeader title="sitemap.xml" {...issueChip(r.sitemap.issueCount)} />
          {r.sitemap.found && r.sitemap.total > 0 ? (
            <>
              <div style={{ fontSize: "13px", color: colors.muted }}>
                {n(r.sitemap.total)} URLs found in the sitemap
                {r.sitemap.checked < r.sitemap.total ? `, ${n(r.sitemap.checked)} checked` : ""}
              </div>
              <StackBar
                label={`${pct(r.sitemap.valid, r.sitemap.checked)} percent of checked sitemap URLs are valid`}
                segments={[
                  { label: "Valid", value: r.sitemap.valid, color: colors.green },
                  { label: "Redirected, broken or noindex", value: r.sitemap.invalid, color: colors.red },
                ]}
              />
            </>
          ) : null}
          <StatGrid>
            <Stat value={n(r.sitemap.total)} label="In sitemap" />
            <Stat value={n(r.sitemap.missingIndexable)} label="Indexable pages missing" />
            <Stat value={n(r.sitemap.duplicates)} label="Duplicate URLs" />
          </StatGrid>
          <Rows rows={r.sitemap.rows} />
          {r.sitemap.indexableUrls.length ? (
            <a href={`/api/audits/${id}/sitemap`} style={{ ...secondaryButton, alignSelf: "flex-start", minHeight: "44px", padding: "0 20px", fontWeight: 600, fontSize: "14px" }}>
              Generate corrected sitemap.xml
            </a>
          ) : null}
        </Card>
      </Grid>

      {fixable > 0 ? (
        <FixBand
          title="Fix these technical issues automatically"
          text={`We can repair the error pages, redirects and canonical problems for you. You approve each change first.`}
          action="Fix technical issues"
          href="#plans"
        />
      ) : null}

      {/* Technical checks */}
      <SectionHeading title="Technical SEO checks" sub="Can search engines reach, understand and trust your website?" />
      <Grid>
        <Card>
          <CardHeader title="Error pages (4xx and 5xx)" {...issueChip(r.statusCodes.clientError + r.statusCodes.serverError, "error", "red")} />
          <div style={{ fontSize: "12px", color: colors.muted }}>Status codes across {n(statusTotal)} crawled pages</div>
          <BarList
            items={[
              { label: "2xx OK", value: r.statusCodes.ok, color: colors.green },
              { label: "3xx redirect", value: r.statusCodes.redirect, color: colors.blue },
              { label: "4xx not found", value: r.statusCodes.clientError, color: colors.orange },
              { label: "5xx server", value: r.statusCodes.serverError, color: colors.red },
            ]}
          />
          <StatGrid columns={2}>
            <Stat value={n(r.statusCodes.clientError)} label="4xx pages (not found)" />
            <Stat value={n(r.statusCodes.serverError)} label="5xx server errors" />
          </StatGrid>
          <Rows rows={r.statusCodes.rows} />
        </Card>
        <Card>
          <CardHeader title="Canonical tags" {...issueChip(r.canonical.issueCount, "issue", "yellow")} />
          <StackBar
            label={`${pct(r.canonical.present, r.canonical.present + r.canonical.missing)} percent of pages have a canonical tag`}
            segments={[
              { label: "Present", value: r.canonical.present, color: colors.green },
              { label: "Missing", value: r.canonical.missing, color: colors.yellow },
            ]}
          />
          <Rows rows={r.canonical.rows} />
        </Card>
        <Card>
          <CardHeader title="Domain variants (http, https, www, non-www)" {...issueChip(r.domainVariants.issueCount, "issue", "red")} />
          <div style={{ fontSize: "12px", color: colors.muted }}>
            Preferred version detected: <span style={mono}>{r.domainVariants.preferred}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {r.domainVariants.variants.map((variant) => (
              <div key={variant.url} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderTop: "1px solid #E2E8F0", flexWrap: "wrap" }}>
                <Badge tone={variant.ok ? "green" : "red"}>{variant.ok ? "Pass" : "Fail"}</Badge>
                <div style={{ flex: 1, minWidth: "min(200px, 100%)" }}>
                  <span style={mono}>{variant.url}</span>
                  <div style={{ fontSize: "12px", color: colors.muted }}>{variant.note}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Structured data (schema)" {...issueChip(r.schema.missingCount, "missing", "red")} />
          <StackBar
            label={`${r.schema.coveragePct} percent schema coverage`}
            legend={false}
            segments={[
              { label: "With schema", value: r.schema.coveragePct, color: colors.blue },
              { label: "Without", value: 100 - r.schema.coveragePct, color: colors.track },
            ]}
          />
          <div style={{ fontSize: "12px", color: colors.muted }}>Schema coverage: {r.schema.coveragePct}% of pages have structured data</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {r.schema.rows.map((row) => (
              <div key={row.type} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderTop: "1px solid #E2E8F0", fontSize: "14px", flexWrap: "wrap" }}>
                <Badge tone={row.status === "found" ? "green" : row.status === "partial" ? "yellow" : "red"}>
                  {row.status === "found" ? "Found" : row.status === "partial" ? "Partial" : "Missing"}
                </Badge>
                <span style={{ flex: 1, minWidth: "min(180px, 100%)" }}>
                  <strong>{row.scope}</strong> : {row.type}
                </span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title={`Key pages within 3 clicks of the homepage`} {...issueChip(r.clickDepth.deepCount, "deep page", "red")} />
          <div style={{ fontSize: "12px", color: colors.muted }}>Pages by click depth</div>
          <BarList
            items={r.clickDepth.buckets.map((value, index) => ({
              label: index === 4 ? "5+ clicks" : `${index + 1} ${index === 0 ? "click" : "clicks"}`,
              value,
              color: index < 2 ? colors.green : index === 2 ? colors.blue : index === 3 ? colors.orange : colors.red,
            }))}
          />
          <Rows rows={r.clickDepth.rows} />
        </Card>
      </Grid>

      {/* On-page checks */}
      <SectionHeading title="On-page SEO checks" sub="Do your pages tell Google and your customers what you offer?" />
      <Grid>
        <Card>
          <CardHeader title="Title tags and headings" chip={r.titles.affected ? `${n(r.titles.affected)} ${r.titles.affected === 1 ? "page" : "pages"} affected` : "No issues"} tone={r.titles.affected ? "red" : "green"} />
          <StackBar
            label={`Title length: ${r.titles.missing} missing, ${r.titles.short} too short, ${r.titles.ideal} ideal, ${r.titles.long} too long`}
            segments={[
              { label: "Missing", value: r.titles.missing, color: colors.red },
              { label: "Under 50 chars", value: r.titles.short, color: colors.yellow },
              { label: "Ideal 50 to 60", value: r.titles.ideal, color: colors.green },
              { label: "Over 60", value: r.titles.long, color: colors.orange },
            ]}
          />
          <Rows rows={r.titles.rows} />
        </Card>
        <Card>
          <CardHeader title="Meta descriptions" chip={r.metas.affected ? `${n(r.metas.affected)} ${r.metas.affected === 1 ? "page" : "pages"} affected` : "No issues"} tone={r.metas.affected ? "red" : "green"} />
          <StackBar
            label={`Meta descriptions: ${r.metas.missing} missing, ${r.metas.duplicate} duplicate, ${r.metas.wrongLength} wrong length, ${r.metas.good} good`}
            segments={[
              { label: "Missing", value: r.metas.missing, color: colors.red },
              { label: "Duplicate", value: r.metas.duplicate, color: colors.orange },
              { label: "Wrong length", value: r.metas.wrongLength, color: colors.yellow },
              { label: "Good", value: r.metas.good, color: colors.green },
            ]}
          />
          <Rows rows={r.metas.rows} />
        </Card>
        <Card>
          <CardHeader title="Image alt text" chip={`${n(r.images.total)} ${r.images.total === 1 ? "image" : "images"}`} tone={r.images.missingAlt ? "red" : "green"} />
          <StackBar
            label={`Images: ${r.images.missingAlt} missing alt text, ${r.images.duplicateAlt} duplicate alt text, ${r.images.good} good`}
            segments={[
              { label: "Missing alt", value: r.images.missingAlt, color: colors.red },
              { label: "Duplicate alt", value: r.images.duplicateAlt, color: colors.yellow },
              { label: "Good", value: r.images.good, color: colors.green },
            ]}
          />
          <StatGrid>
            <Stat value={n(r.images.total)} label="Images found" />
            <Stat value={n(r.images.missingAlt)} label="Missing alt text" />
            <Stat value={n(r.images.duplicateAlt)} label="Duplicate alt text" />
          </StatGrid>
          <Rows rows={r.images.rows} />
        </Card>
        <Card>
          <CardHeader title="Trust signals (reviews and testimonials)" {...issueChip(r.trust.gaps, "gap", "yellow")} />
          <div style={{ fontSize: "12px", color: colors.muted }}>Trust score: {r.trust.scorePct}%</div>
          <StackBar
            label={`Trust score ${r.trust.scorePct} percent`}
            legend={false}
            segments={[
              { label: "Score", value: r.trust.scorePct, color: colors.blue },
              { label: "Rest", value: 100 - r.trust.scorePct, color: colors.track },
            ]}
          />
          <Rows rows={r.trust.rows} />
        </Card>
      </Grid>

      {r.titles.affected + r.metas.affected > 0 ? (
        <FixBand
          title={`Rewrite ${n(r.titles.affected)} titles and ${n(r.metas.affected)} meta descriptions in one click`}
          text="AI drafts them from your page content and keywords. Nothing goes live until you approve it."
          action="Fix on-page issues"
          href="#plans"
        />
      ) : null}

      {/* Mobile, security and AI search */}
      <SectionHeading title="Mobile, security and AI search" sub="Can customers use your website on a phone, trust it, and find it through AI assistants?" />
      <Grid min={300}>
        <Mini title="Mobile" chip={issueChip(r.mobile.rows.filter((row) => row.status === "fail" || row.status === "warn").length)}>
          <Rows rows={r.mobile.rows} />
        </Mini>
        <Mini title="Security" chip={issueChip(r.security.rows.filter((row) => row.status === "fail" || row.status === "warn").length)}>
          <Rows rows={r.security.rows} />
        </Mini>
        <Mini title="AI search readiness" chip={issueChip(r.ai.rows.filter((row) => row.status === "fail" || row.status === "warn").length)}>
          <Rows rows={r.ai.rows} />
        </Mini>
      </Grid>

      {/* Every issue */}
      <SectionHeading title={`All ${n(r.issueTotal)} issues`} sub="Open an issue to see how to fix it and which pages it affects." />
      <Card style={{ gap: 0 }}>
        {r.issues.length ? (
          r.issues.map((issue) => <IssueDetails key={issue.id} issue={issue} unlocked={unlocked} />)
        ) : (
          <div style={{ fontSize: "14px", color: colors.muted }}>No issues found on the pages we crawled.</div>
        )}
      </Card>

      {/* Plans */}
      <div id="plans" style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "8px", scrollMarginTop: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 800, letterSpacing: "-0.01em" }}>Choose how you want these issues fixed</h2>
          <div style={{ fontSize: "14px", color: colors.muted }}>
            Pick a plan and we start fixing the critical issues first. You approve every change before it goes live.
          </div>
        </div>
        <Grid min={280}>
          <PlanCard
            href={signupHref("autopilot", id)}
            name="Autopilot"
            price="$79"
            unit="/month"
            text="Automatic audits and safe fixes for one website."
            features={["Weekly automatic site audit", "Titles, meta descriptions, alt text and internal links fixed after your approval", "WordPress and Shopify connection", "Monthly progress report"]}
            action="Start Autopilot"
          />
          <PlanCard
            href={signupHref("growth", id)}
            name="Growth"
            price="$229"
            unit="/month"
            featured
            text="Everything in Autopilot plus rankings and local growth, for up to 3 websites."
            features={["Up to 3 websites", "Keyword and competitor tracking", "Local SEO and review monitoring", "AI search visibility tracking", "Content briefs with human review", "Monthly strategy call"]}
            action="Choose Growth"
          />
          <PlanCard
            href={signupHref("full", id)}
            name="Full SEO package"
            price="Custom"
            unit="quote"
            outline
            text="A dedicated team that handles SEO for you."
            features={["Content and link building", "Local SEO and citations", "Conversion optimisation", "Reporting on leads and revenue"]}
            action="Book a strategy call"
          />
        </Grid>
        <div style={{ display: "flex", gap: "12px 28px", flexWrap: "wrap", fontSize: "14px", color: colors.label }}>
          {["Approve every change before it goes live", "Cancel anytime", "One-click rollback on any change"].map((item) => (
            <div key={item} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <Check />
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* Estimate and email capture */}
      <Grid>
        <Card>
          <CardTitle>Estimated score after fixes</CardTitle>
          <svg viewBox="0 0 400 190" width="100%" role="img" aria-label={`Estimated health score rises from ${r.scores.overall} percent today to ${r.scores.estimatedAfterFixes} percent after fixing critical and high issues`}>
            <line x1="40" y1="150" x2="380" y2="150" stroke="#CBD5E1" />
            <rect x="90" y={150 - todayHeight} width="80" height={todayHeight} rx="6" fill="#94A3B8" />
            <rect x="240" y={150 - afterHeight} width="80" height={afterHeight} rx="6" fill="#2563EB" />
            <text x="130" y={140 - todayHeight} textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="16" fontWeight="700" fill={colors.text}>
              {r.scores.overall}%
            </text>
            <text x="280" y={140 - afterHeight} textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="16" fontWeight="700" fill={colors.text}>
              {r.scores.estimatedAfterFixes}%
            </text>
            <text x="130" y="172" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="12" fill={colors.muted}>Today</text>
            <text x="280" y="172" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="12" fill={colors.muted}>After fixes</text>
          </svg>
          <div style={{ fontSize: "13px", color: colors.muted }}>Estimate based on fixing all critical and high issues.</div>
        </Card>
        <EmailCapture id={id} issueTotal={r.issueTotal} unlocked={unlocked} onUnlock={onUnlock} />
      </Grid>
    </div>
  );
}
