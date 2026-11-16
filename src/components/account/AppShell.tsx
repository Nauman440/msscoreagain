import Link from "next/link";
import type { ReactNode } from "react";
import { colors } from "@/components/report/ui";
import LogoutButton from "./LogoutButton";

/** Page frame for the account pages: header, centred content, same look as the report. */
export default function AppShell({ children, loggedIn, narrow }: { children: ReactNode; loggedIn: boolean; narrow?: boolean }) {
  return (
    <div className="report" style={{ fontFamily: "Inter, system-ui, sans-serif", background: "#F5F7FA", color: colors.text, minHeight: "100vh", boxSizing: "border-box" }}>
      <header style={{ background: "#FFFFFF", borderBottom: "1px solid #E2E8F0" }}>
        <div style={{ maxWidth: "1120px", margin: "0 auto", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap", boxSizing: "border-box" }}>
          <Link href="/" style={{ fontWeight: 800, fontSize: "20px", letterSpacing: "-0.02em", color: colors.text, textDecoration: "none" }}>
            MSScore
          </Link>
          <nav aria-label="Account" style={{ display: "flex", alignItems: "center", gap: "20px", fontSize: "14px" }}>
            {loggedIn ? (
              <>
                <Link href="/dashboard" style={{ color: colors.muted, textDecoration: "none" }}>Dashboard</Link>
                <LogoutButton />
              </>
            ) : (
              <Link href="/login" style={{ color: colors.muted, textDecoration: "none" }}>Log in</Link>
            )}
          </nav>
        </div>
      </header>
      <main style={{ maxWidth: narrow ? "480px" : "1120px", margin: "0 auto", padding: "40px 24px 64px", display: "flex", flexDirection: "column", gap: "24px", boxSizing: "border-box" }}>
        {children}
      </main>
    </div>
  );
}
