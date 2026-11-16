"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AuditForm from "@/components/AuditForm";
import type { AuditProgress, AuditResult, AuditStatus } from "@/lib/audit/types";
import Report from "./Report";
import { Card, colors, primaryButton } from "./ui";

interface AuditResponse {
  id: string;
  host: string;
  status: AuditStatus;
  progress: AuditProgress;
  error: string | null;
  createdAt: string;
  unlocked: boolean;
  result: AuditResult | null;
}

const POLL_MS = 1_500;

function Header() {
  return (
    <div style={{ background: "#FFFFFF", borderBottom: "1px solid #E2E8F0" }}>
      <div style={{ maxWidth: "1120px", margin: "0 auto", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", boxSizing: "border-box" }}>
        <Link href="/" style={{ fontWeight: 800, fontSize: "20px", letterSpacing: "-0.02em", color: colors.text, textDecoration: "none" }}>
          MSScore
        </Link>
        <nav aria-label="Main" style={{ display: "flex", alignItems: "center", gap: "24px", flexWrap: "wrap", fontSize: "14px" }}>
          <Link href="/#automation" style={{ color: colors.muted, textDecoration: "none" }}>Features</Link>
          <Link href="/#pricing" style={{ color: colors.muted, textDecoration: "none" }}>Pricing</Link>
          <a href="#plans" style={{ ...primaryButton, minHeight: "44px", padding: "0 20px", fontWeight: 600, fontSize: "14px", color: "#FFFFFF" }}>
            Fix my website
          </a>
        </nav>
      </div>
    </div>
  );
}

function AuditAgain({ defaultUrl, status }: { defaultUrl: string; status?: string }) {
  return (
    <Card style={{ padding: "28px", gap: "16px" }}>
      <h1 style={{ margin: 0, fontSize: "34px", fontWeight: 800, letterSpacing: "-0.02em" }}>Find out why customers cannot find your website</h1>
      <div style={{ fontSize: "16px", color: colors.muted }}>
        Get a free SEO audit in about 60 seconds. See what is blocking your rankings and exactly what to fix first.
      </div>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        {["Free", "No signup needed", "Technical, on-page, local and AI search checks"].map((label) => (
          <span key={label} style={{ background: "#EFF6FF", color: "#1D4ED8", fontSize: "13px", fontWeight: 600, padding: "4px 12px", borderRadius: "999px" }}>
            {label}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
        <AuditForm>
          <div style={{ flex: 1, minWidth: "min(260px, 100%)", display: "flex", flexDirection: "column", gap: "6px" }}>
            <label htmlFor="site" style={{ fontSize: "13px", fontWeight: 600, color: colors.label }}>
              Website URL
            </label>
            <input
              id="site"
              name="url"
              type="text"
              inputMode="url"
              autoComplete="url"
              defaultValue={defaultUrl}
              style={{ minHeight: "48px", padding: "0 16px", border: "1px solid #CBD5E1", borderRadius: "10px", fontSize: "16px", fontFamily: "inherit", color: colors.text, boxSizing: "border-box", width: "100%" }}
            />
          </div>
          <button type="submit" style={{ ...primaryButton, fontSize: "16px", padding: "0 28px" }}>
            Run audit
          </button>
        </AuditForm>
      </div>
      {status ? <div style={{ fontSize: "13px", color: colors.muted }}>{status}</div> : null}
    </Card>
  );
}

function Progress({ data }: { data: AuditResponse | null }) {
  const crawled = data?.progress.pagesCrawled ?? 0;
  const cap = data?.progress.pageCap ?? 50;
  const width = Math.min(95, Math.max(5, (100 * crawled) / Math.max(1, cap)));
  return (
    <Card style={{ padding: "40px 28px", alignItems: "center", textAlign: "center", gap: "18px" }}>
      <div
        aria-hidden="true"
        style={{ width: "44px", height: "44px", borderRadius: "999px", border: "4px solid #DBEAFE", borderTopColor: "#2563EB", animation: "msscore-spin 0.9s linear infinite" }}
      />
      <h1 style={{ margin: 0, fontSize: "26px", fontWeight: 800 }} role="status">
        {data?.host ? `Auditing ${data.host}` : "Starting your audit"}
      </h1>
      <div style={{ fontSize: "15px", color: colors.muted }}>
        {data?.progress.stage ?? "Waiting to start"}
        {crawled ? ` (${crawled} of up to ${cap} pages)` : ""}
      </div>
      <div style={{ width: "100%", maxWidth: "420px", height: "10px", background: colors.track, borderRadius: "6px" }}>
        <div style={{ width: `${width}%`, height: "10px", background: "#2563EB", borderRadius: "6px", transition: "width 0.6s ease" }} />
      </div>
      <div style={{ fontSize: "13px", color: colors.muted }}>This usually takes about a minute. You can keep this page open.</div>
    </Card>
  );
}

export default function ReportClient({ id }: { id: string }) {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [networkError, setNetworkError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const key = new URLSearchParams(window.location.search).get("key");
    const url = `/api/audits/${id}${key ? `?key=${encodeURIComponent(key)}` : ""}`;

    const poll = async () => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (cancelled) return;
        if (response.status === 404) {
          setNotFound(true);
          return;
        }
        const next = (await response.json()) as AuditResponse;
        if (cancelled) return;
        setData(next);
        setNetworkError(false);
        if (next.status === "queued" || next.status === "running") timer = setTimeout(poll, POLL_MS);
      } catch {
        if (cancelled) return;
        setNetworkError(true);
        timer = setTimeout(poll, POLL_MS * 2);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  const result = data?.status === "done" ? data.result : null;
  let body;
  if (notFound) {
    body = <AuditAgain defaultUrl="" status="We could not find that report. It may have expired. Run a new audit below." />;
  } else if (data?.status === "failed") {
    body = (
      <>
        <div role="alert" style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "16px", padding: "24px", fontSize: "15px", color: "#7F1D1D" }}>
          <strong>We could not audit {data.host}.</strong> {data.error}
        </div>
        <AuditAgain defaultUrl={data.host} />
      </>
    );
  } else if (result && data) {
    const date = new Date(result.crawl.finishedAt).toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric" });
    body = (
      <>
        <AuditAgain
          defaultUrl={result.site.finalUrl}
          status={`Report for ${result.site.host}. Crawled ${result.crawl.pagesCrawled} pages${result.crawl.capped ? ` (the free audit checks up to ${result.crawl.pageCap})` : ""}. Audited ${date}.`}
        />
        <Report
          id={id}
          result={result}
          unlocked={data.unlocked}
          onUnlock={(full) => setData((current) => (current ? { ...current, unlocked: true, result: full } : current))}
        />
      </>
    );
  } else {
    body = <Progress data={data} />;
  }

  return (
    <div className="report" style={{ fontFamily: "Inter, system-ui, sans-serif", background: "#F5F7FA", color: colors.text, minHeight: "100vh", boxSizing: "border-box" }}>
      <Header />
      <main style={{ maxWidth: "1120px", margin: "0 auto", padding: "40px 24px 64px", display: "flex", flexDirection: "column", gap: "24px", boxSizing: "border-box" }}>
        {networkError ? (
          <div role="status" style={{ fontSize: "13px", color: "#B45309" }}>
            Connection lost. Retrying...
          </div>
        ) : null}
        {body}
      </main>
      {result ? (
        <div style={{ position: "sticky", bottom: 0, background: "#0F172A", color: "#FFFFFF", padding: "12px 24px", display: "flex", gap: "16px", alignItems: "center", justifyContent: "center", flexWrap: "wrap", boxSizing: "border-box" }}>
          <div style={{ fontSize: "14px" }}>
            Your SEO health score is <strong>{result.scores.overall}%</strong>. Start fixing your top issues today.
          </div>
          <a href="#plans" style={{ minHeight: "44px", padding: "0 20px", borderRadius: "10px", background: "#3B82F6", color: "#0F172A", fontWeight: 700, fontSize: "14px", display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
            Start fixing, from $79/month
          </a>
        </div>
      ) : null}
    </div>
  );
}
