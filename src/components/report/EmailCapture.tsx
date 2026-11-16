"use client";

import { useState, type FormEvent } from "react";
import { bookingUrl } from "@/lib/site";
import type { AuditResult } from "@/lib/audit/types";

export default function EmailCapture({ id, issueTotal, unlocked, onUnlock }: {
  id: string;
  issueTotal: number;
  unlocked: boolean;
  onUnlock: (result: AuditResult) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    if (!email) {
      setError("Enter your email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/audits/${id}/lead`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; emailed?: boolean; result?: AuditResult };
      if (!response.ok || !data.result) {
        setError(data.error || "We could not save your email. Please try again.");
        return;
      }
      setMessage(
        data.emailed
          ? `Done. Your full report is unlocked below, and we sent the link to ${email}.`
          : "Your full report is unlocked below. We could not send the email right now, so bookmark this page.",
      );
      onUnlock(data.result);
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      id="full-report"
      style={{
        background: "#0F172A",
        color: "#FFFFFF",
        borderRadius: "16px",
        padding: "28px",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        justifyContent: "center",
        scrollMarginTop: "16px",
      }}
    >
      <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 800, letterSpacing: "-0.01em" }}>
        {unlocked ? "Your full report is unlocked" : `Get the full report with all ${issueTotal} issues`}
      </h2>
      <div style={{ fontSize: "14px", color: "#CBD5E1" }}>
        {unlocked
          ? message ?? "Every affected page is listed under each issue above. Use the link we emailed you to come back to it."
          : "Includes every affected page, the exact fix for each issue, and a ready-to-approve change list."}
      </div>
      {!unlocked ? (
        <form onSubmit={onSubmit} noValidate style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: "min(200px, 100%)", display: "flex", flexDirection: "column", gap: "6px" }}>
            <label htmlFor="mail" style={{ fontSize: "13px", fontWeight: 600, color: "#E2E8F0" }}>
              Work email
            </label>
            <input
              id="mail"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@company.com"
              disabled={busy}
              style={{ minHeight: "48px", padding: "0 14px", border: 0, borderRadius: "10px", fontSize: "15px", fontFamily: "inherit", boxSizing: "border-box", width: "100%" }}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            style={{ alignSelf: "flex-end", minHeight: "48px", padding: "0 22px", border: 0, borderRadius: "10px", background: "#3B82F6", color: "#0F172A", fontWeight: 700, fontSize: "15px", fontFamily: "inherit" }}
          >
            {busy ? "Sending..." : "Email my report"}
          </button>
          {error ? (
            <p role="alert" style={{ flexBasis: "100%", margin: 0, fontSize: "13px", fontWeight: 600, color: "#FCA5A5" }}>
              {error}
            </p>
          ) : null}
          <p style={{ flexBasis: "100%", margin: 0, fontSize: "12px", color: "#94A3B8" }}>
            We will email you the report and a few tips. Unsubscribe any time.
          </p>
        </form>
      ) : null}
      <a
        href={bookingUrl}
        style={{ minHeight: "44px", padding: "0 20px", border: "1px solid #64748B", borderRadius: "10px", background: "transparent", color: "#FFFFFF", fontWeight: 600, fontSize: "14px", alignSelf: "flex-start", display: "inline-flex", alignItems: "center", textDecoration: "none" }}
      >
        Book a free strategy call
      </a>
    </div>
  );
}
