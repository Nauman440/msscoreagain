import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/components/account/AppShell";
import { Badge, Card, CardTitle, Chip, colors, Grid, primaryButton, ScoreGauge, secondaryButton } from "@/components/report/ui";
import { currentAccount } from "@/lib/account/session";
import { ONBOARDING_DONE, type Business } from "@/lib/account/types";
import { loadAudit } from "@/lib/audit/run";
import { PLANS } from "@/lib/plans";

export const metadata: Metadata = { title: "Dashboard | MSScore", robots: { index: false, follow: false } };

const STATUS: Record<Business["planStatus"], { label: string; tone: "green" | "yellow" | "grey" }> = {
  active: { label: "Active", tone: "green" },
  pending_payment: { label: "Payment not set up yet", tone: "yellow" },
  quote_requested: { label: "Quote requested", tone: "grey" },
};

const PLATFORM_LABEL: Record<string, string> = {
  wordpress: "WordPress",
  shopify: "Shopify",
  wix: "Wix",
  squarespace: "Squarespace",
  other: "Other",
};

function Row({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div style={{ display: "flex", gap: "16px", padding: "10px 0", borderTop: "1px solid #E2E8F0", fontSize: "14px", flexWrap: "wrap" }}>
      <span style={{ width: "150px", flexShrink: 0, color: colors.muted }}>{label}</span>
      <span style={{ flex: 1, minWidth: "min(180px, 100%)", whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{value || "Not given"}</span>
    </div>
  );
}

export default async function DashboardPage() {
  const account = await currentAccount();
  if (!account) redirect("/login");
  const { user, business } = account;
  if (!business) redirect("/#pricing");
  if (business.onboardingStep < ONBOARDING_DONE) redirect("/signup");

  const plan = PLANS[business.plan];
  const status = STATUS[business.planStatus];
  const audit = business.auditId ? await loadAudit(business.auditId) : null;
  const score = audit?.result?.scores.overall ?? null;
  const access = business.profile.access;
  const firstName = user.name.split(" ")[0];

  const steps: { label: string; detail: string; state: "done" | "next" | "later" }[] = [
    { label: "Account and setup", detail: "Your business details are saved.", state: "done" },
    { label: "Consent recorded", detail: business.consentAt ? `Recorded on ${new Date(business.consentAt).toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric" })}.` : "Not recorded.", state: business.consentAt ? "done" : "next" },
    {
      label: business.plan === "full" ? "Your quote" : "Payment",
      detail: business.plan === "full" ? "Our team will contact you with a quote." : "We will ask for payment details before your plan starts. You have not been charged.",
      state: "next",
    },
    { label: "Connect your accounts", detail: "We will help you connect Search Console, Analytics and your website.", state: "later" },
    { label: "Your SEO roadmap", detail: "A specialist reviews your strategy within 3 to 5 working days of your plan starting.", state: "later" },
  ];

  return (
    <AppShell loggedIn>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <h1 style={{ margin: 0, fontSize: "30px", fontWeight: 800, letterSpacing: "-0.02em" }}>Welcome, {firstName}</h1>
        <p style={{ margin: 0, fontSize: "15px", color: colors.muted }}>
          {business.name} · {business.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
        </p>
      </div>

      <Grid min={300}>
        <Card>
          <CardTitle>Your plan</CardTitle>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ fontSize: "22px", fontWeight: 800 }}>{plan.name}</div>
            <div>
              <span style={{ fontSize: "22px", fontWeight: 800 }}>{plan.price}</span> <span style={{ fontSize: "14px", color: colors.muted }}>{plan.unit}</span>
            </div>
          </div>
          <Chip tone={status.tone} style={{ alignSelf: "flex-start" }}>{status.label}</Chip>
        </Card>
        <Card style={{ alignItems: "center" }}>
          <div style={{ alignSelf: "flex-start" }}>
            <CardTitle>Free audit score</CardTitle>
          </div>
          {score !== null && audit ? (
            <>
              <ScoreGauge score={score} label={audit.result?.scores.label ?? ""} />
              <Link href={`/report/${audit.id}`} style={{ ...secondaryButton, minHeight: "44px", fontSize: "14px" }}>
                View full report
              </Link>
            </>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: "14px", color: colors.muted, alignSelf: "flex-start" }}>No audit linked to your account yet.</p>
              <Link href="/#audit" style={{ ...primaryButton, minHeight: "44px", fontSize: "14px", color: "#FFFFFF" }}>
                Run a free audit
              </Link>
            </>
          )}
        </Card>
      </Grid>

      <Card>
        <CardTitle>What happens next</CardTitle>
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {steps.map((step) => (
            <li key={step.label} style={{ display: "flex", gap: "12px", alignItems: "flex-start", padding: "12px 0", borderTop: "1px solid #E2E8F0" }}>
              <Badge tone={step.state === "done" ? "green" : step.state === "next" ? "yellow" : "grey"}>
                {step.state === "done" ? "Done" : step.state === "next" ? "Next" : "Later"}
              </Badge>
              <div>
                <div style={{ fontWeight: 600, fontSize: "15px" }}>{step.label}</div>
                <div style={{ fontSize: "14px", color: colors.muted }}>{step.detail}</div>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <CardTitle>Your business details</CardTitle>
          <Link href="/signup?step=2" style={{ fontSize: "14px", fontWeight: 600 }}>
            Edit details
          </Link>
        </div>
        <div>
          <Row label="Contact" value={`${user.name}, ${user.email}, ${user.phone}`} />
          <Row label="Website" value={business.website} />
          <Row label="Platform" value={business.profile.platform ? PLATFORM_LABEL[business.profile.platform] : undefined} />
          <Row label="Country" value={business.profile.country} />
          <Row label="Other countries" value={business.profile.targetCountries} />
          <Row label="Areas served" value={business.profile.serviceAreas} />
          <Row label="Language" value={business.profile.language} />
          <Row label="Main services" value={business.profile.mainServices} />
          <Row label="Most profitable" value={business.profile.topServices} />
          <Row label="Competitors" value={business.profile.competitors} />
          <Row
            label="Can give access to"
            value={
              access
                ? [access.searchConsole && "Search Console", access.analytics && "Analytics", access.businessProfile && "Business Profile", access.website && "Website admin"]
                    .filter(Boolean)
                    .join(", ") || "None yet"
                : undefined
            }
          />
        </div>
      </Card>
    </AppShell>
  );
}
