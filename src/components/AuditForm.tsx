"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";

/**
 * Wraps a URL input and a submit button taken from the design. The form uses
 * `display: contents` so it does not change the layout of its children.
 * The input must be named "url".
 */
export default function AuditForm({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const url = String(new FormData(event.currentTarget).get("url") ?? "").trim();
    if (!url) {
      setError("Enter your website address, for example yourdomain.com.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/audits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!response.ok || !data.id) {
        setError(data.error || "We could not start the audit. Please try again.");
        setBusy(false);
        return;
      }
      router.push(`/report/${data.id}`);
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "contents" }} noValidate aria-busy={busy}>
      <fieldset disabled={busy} style={{ display: "contents" }}>
        {children}
      </fieldset>
      {busy ? (
        <p role="status" style={{ flexBasis: "100%", margin: 0, fontSize: "13px", fontWeight: 600, color: "#F97316" }}>
          Starting your audit...
        </p>
      ) : null}
      {error ? (
        <p role="alert" style={{ flexBasis: "100%", margin: 0, fontSize: "13px", fontWeight: 600, color: "#F87171" }}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
