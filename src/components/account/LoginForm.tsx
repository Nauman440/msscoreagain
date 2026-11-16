"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Card, colors, primaryButton } from "@/components/report/ui";
import { FormError, TextField } from "./fields";

export default function LoginForm() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; next?: string };
      if (!response.ok) {
        setError(data.error ?? "We could not log you in. Please try again.");
        return;
      }
      router.replace(data.next ?? "/dashboard");
      router.refresh();
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ padding: "28px", gap: "20px" }}>
      <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 800, letterSpacing: "-0.02em" }}>Log in</h1>
      <form onSubmit={onSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <FormError message={error} />
        <TextField name="email" label="Email" type="email" inputMode="email" autoComplete="email" required />
        <TextField name="password" label="Password" type="password" autoComplete="current-password" required />
        <button type="submit" disabled={busy} style={{ ...primaryButton, fontSize: "16px" }}>
          {busy ? "Logging in..." : "Log in"}
        </button>
      </form>
      <p style={{ margin: 0, fontSize: "14px", color: colors.muted }}>
        New to MSScore? <Link href="/#pricing">Choose a plan</Link> or <Link href="/#audit">run a free audit</Link>.
      </p>
    </Card>
  );
}
