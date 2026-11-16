"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Card, Check, colors, primaryButton, secondaryButton } from "@/components/report/ui";
import type { Business } from "@/lib/account/types";
import type { Plan } from "@/lib/plans";
import { Checkbox, FormError, Select, TextArea, TextField, twoColumns } from "./fields";

const STEPS = ["About you", "Website", "Market", "Business", "Connections"];

const PLATFORM_OPTIONS = [
  { value: "wordpress", label: "WordPress" },
  { value: "shopify", label: "Shopify" },
  { value: "wix", label: "Wix" },
  { value: "squarespace", label: "Squarespace" },
  { value: "other", label: "Something else or not sure" },
];

export interface SignupFlowProps {
  plan: Plan;
  auditId: string | null;
  audit: { host: string; score: number } | null;
  /** Null until the account exists (step 1). */
  business: Business | null;
  /** The step to open on: 1 for new visitors, the saved step for owners coming back. */
  startStep: number;
}

function StepBar({ current }: { current: number }) {
  return (
    <ol aria-label="Setup steps" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", gap: "8px", flexWrap: "wrap" }}>
      {STEPS.map((label, index) => {
        const number = index + 1;
        const done = number < current;
        const active = number === current;
        return (
          <li
            key={label}
            aria-current={active ? "step" : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "13px",
              fontWeight: active ? 700 : 500,
              color: active ? "#1D4ED8" : done ? colors.label : colors.muted,
              background: active ? "#EFF6FF" : "transparent",
              border: `1px solid ${active ? "#BFDBFE" : "#E2E8F0"}`,
              borderRadius: "999px",
              padding: "6px 12px 6px 6px",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: "22px",
                height: "22px",
                borderRadius: "999px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                fontWeight: 700,
                background: done ? "#15803D" : active ? "#2563EB" : "#E2E8F0",
                color: done || active ? "#FFFFFF" : colors.muted,
              }}
            >
              {done ? "✓" : number}
            </span>
            {label}
            {done ? <span style={{ position: "absolute", left: "-9999px" }}>(done)</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

function Summary({ plan, audit }: { plan: Plan; audit: SignupFlowProps["audit"] }) {
  return (
    <Card style={{ gap: "16px" }}>
      <div style={{ fontSize: "13px", fontWeight: 700, color: colors.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Your plan</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ fontSize: "20px", fontWeight: 800 }}>{plan.name}</div>
        <div>
          <span style={{ fontSize: "24px", fontWeight: 800 }}>{plan.price}</span>{" "}
          <span style={{ fontSize: "14px", color: colors.muted }}>{plan.unit}</span>
        </div>
      </div>
      <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: "10px", padding: "12px 14px", fontSize: "14px", color: "#14532D" }}>
        {plan.id === "full"
          ? "No payment now. We will contact you with a quote after you finish setup."
          : "No payment today. We will ask for payment details before your plan starts, and you will not be charged without confirming."}
      </div>
      {audit ? (
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "14px", borderTop: "1px solid #E2E8F0", paddingTop: "14px" }}>
          <span>
            Free audit for <strong>{audit.host}</strong>
          </span>
          <strong>{audit.score}%</strong>
        </div>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "14px", color: colors.label }}>
        {["Nothing changes on your website without your approval", "One-click undo on any change", "Cancel anytime"].map((item) => (
          <div key={item} style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
            <Check />
            {item}
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Reads a form into a plain object. Checkboxes become true or false. */
function formValues(form: HTMLFormElement): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const element of Array.from(form.elements)) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) continue;
    if (!element.name) continue;
    values[element.name] = element instanceof HTMLInputElement && element.type === "checkbox" ? element.checked : element.value;
  }
  return values;
}

export default function SignupFlow({ plan, auditId, audit, business: initialBusiness, startStep }: SignupFlowProps) {
  const [step, setStep] = useState(startStep);
  const [business, setBusiness] = useState(initialBusiness);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const headingRef = useRef<HTMLHeadingElement>(null);
  const router = useRouter();

  const goTo = (next: number) => {
    setStep(next);
    setError(null);
    setFieldErrors({});
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => headingRef.current?.focus(), 50);
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = formValues(event.currentTarget);
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const isSignup = step === 1;
      const payload = isSignup
        ? { ...values, plan: plan.id, auditId }
        : step === 5
          ? {
              step,
              consent: values.consent,
              access: {
                searchConsole: values.searchConsole,
                analytics: values.analytics,
                businessProfile: values.businessProfile,
                website: values.websiteAccess,
              },
            }
          : { ...values, step };
      const response = await fetch(isSignup ? "/api/account/signup" : "/api/account/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        fields?: Record<string, string>;
        business?: Business;
        next?: string | null;
      };
      if (!response.ok) {
        if (data.fields) {
          setFieldErrors(data.fields);
          // Move focus to the first field with a problem.
          const first = Object.keys(data.fields)[0];
          setTimeout(() => document.getElementById(`f-${first === "websiteAccess" ? "websiteAccess" : first}`)?.focus(), 0);
        } else {
          setError(data.error ?? "Something went wrong. Please try again.");
        }
        return;
      }
      if (isSignup) {
        // Reload the page on the server so it picks up the new login and the saved business.
        router.replace("/signup?step=2");
        router.refresh();
        return;
      }
      if (data.business) setBusiness(data.business);
      if (data.next) {
        router.push(data.next);
        return;
      }
      goTo(step + 1);
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const profile = business?.profile ?? {};
  let title: string;
  let intro: string;
  let fields: ReactNode;
  switch (step) {
    case 1:
      title = "Create your account";
      intro = "Tell us who you are. You will use this email and password to log in.";
      fields = (
        <>
          <div style={twoColumns}>
            <TextField name="name" label="Your name" autoComplete="name" required error={fieldErrors.name} />
            <TextField name="businessName" label="Business name" autoComplete="organization" required error={fieldErrors.businessName} />
          </div>
          <div style={twoColumns}>
            <TextField name="email" label="Email" type="email" inputMode="email" autoComplete="email" required error={fieldErrors.email} />
            <TextField name="phone" label="Phone" type="tel" inputMode="tel" autoComplete="tel" required error={fieldErrors.phone} />
          </div>
          <TextField
            name="password"
            label="Password"
            type="password"
            autoComplete="new-password"
            hint="At least 8 characters."
            required
            error={fieldErrors.password}
          />
        </>
      );
      break;
    case 2:
      title = "Your website";
      intro = audit ? "We filled this in from your free audit. Check it is right." : "Which website should we work on?";
      fields = (
        <>
          <TextField
            name="website"
            label="Website address"
            inputMode="url"
            autoComplete="url"
            placeholder="yourdomain.com"
            defaultValue={business?.website}
            required
            error={fieldErrors.website}
          />
          <Select
            name="platform"
            label="What is your website built with?"
            hint="This tells us how we will connect to it later."
            defaultValue={profile.platform}
            options={PLATFORM_OPTIONS}
            error={fieldErrors.platform}
          />
        </>
      );
      break;
    case 3:
      title = "Where you do business";
      intro = "We use this to find the searches and competitors that matter in your area.";
      fields = (
        <>
          <div style={twoColumns}>
            <TextField name="country" label="Country" autoComplete="country-name" defaultValue={profile.country} required error={fieldErrors.country} />
            <TextField name="language" label="Website language" defaultValue={profile.language ?? "English"} required error={fieldErrors.language} />
          </div>
          <TextField
            name="targetCountries"
            label="Other countries you serve (optional)"
            hint="Leave empty if you only serve your own country."
            defaultValue={profile.targetCountries}
            error={fieldErrors.targetCountries}
          />
          <TextArea
            name="serviceAreas"
            label="Cities and areas you serve"
            hint="One per line or separated by commas, for example: Islamabad, Rawalpindi."
            defaultValue={profile.serviceAreas}
            required
            error={fieldErrors.serviceAreas}
          />
        </>
      );
      break;
    case 4:
      title = "Your services";
      intro = "This decides which pages and keywords we work on first.";
      fields = (
        <>
          <TextArea
            name="mainServices"
            label="Main services"
            hint="For example: AC repair, AC installation, heating repair."
            defaultValue={profile.mainServices}
            required
            error={fieldErrors.mainServices}
          />
          <TextArea
            name="topServices"
            label="Most profitable services (optional)"
            hint="We will prioritise these."
            defaultValue={profile.topServices}
            error={fieldErrors.topServices}
          />
          <TextArea
            name="competitors"
            label="Competitors you know about (optional)"
            hint="Names or websites. We will find others too."
            defaultValue={profile.competitors}
            error={fieldErrors.competitors}
          />
        </>
      );
      break;
    default:
      title = "Connections and consent";
      intro = "Connecting your accounts lets us measure results and prepare fixes. You do not need to connect anything today: tick what you can give us access to, and we will set it up with you.";
      fields = (
        <>
          <fieldset style={{ border: "1px solid #E2E8F0", borderRadius: "12px", padding: "8px 16px 4px", margin: 0 }}>
            <legend style={{ fontSize: "14px", fontWeight: 600, color: colors.label, padding: "0 6px" }}>I can give access to</legend>
            <Checkbox name="searchConsole" label="Google Search Console" hint="Your real clicks, rankings and indexing problems." defaultChecked={profile.access?.searchConsole} />
            <Checkbox name="analytics" label="Google Analytics" hint="Visits, calls and form leads from search." defaultChecked={profile.access?.analytics} />
            <Checkbox name="businessProfile" label="Google Business Profile" hint="Your map listing and reviews." defaultChecked={profile.access?.businessProfile} />
            <Checkbox name="websiteAccess" label="My website admin (WordPress or Shopify)" hint="So approved fixes can be applied for you." defaultChecked={profile.access?.website} />
          </fieldset>
          <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "12px", padding: "8px 16px" }}>
            <Checkbox
              name="consent"
              defaultChecked={Boolean(business?.consentAt)}
              error={fieldErrors.consent}
              label={<strong>I allow MSScore to prepare changes to my website</strong>}
              hint="Nothing goes live until I approve it, I can undo any change in one click, and nothing changes until my website ownership is verified."
            />
          </div>
        </>
      );
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "24px", alignItems: "flex-start" }}>
      <Card style={{ padding: "28px", gap: "20px", flex: "2 1 560px", minWidth: 0 }}>
        <StepBar current={step} />
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: colors.muted }}>
            Step {step} of {STEPS.length}
          </div>
          <h1 ref={headingRef} tabIndex={-1} style={{ margin: 0, fontSize: "28px", fontWeight: 800, letterSpacing: "-0.02em", outline: "none" }}>
            {title}
          </h1>
          <p style={{ margin: 0, fontSize: "15px", color: colors.muted }}>{intro}</p>
        </div>
        <form key={step} onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <FormError message={error} />
          {fields}
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center", marginTop: "4px" }}>
            {step > 2 ? (
              <button type="button" onClick={() => goTo(step - 1)} disabled={busy} style={{ ...secondaryButton, fontSize: "15px" }}>
                Back
              </button>
            ) : null}
            <button type="submit" disabled={busy} style={{ ...primaryButton, fontSize: "16px", padding: "0 28px" }}>
              {busy ? "Saving..." : step === 1 ? "Create account" : step === STEPS.length ? "Finish setup" : "Continue"}
            </button>
            {step === 1 ? (
              <span style={{ fontSize: "14px", color: colors.muted }}>
                Already have an account? <Link href="/login">Log in</Link>
              </span>
            ) : null}
          </div>
          {step === 1 ? (
            <p style={{ margin: 0, fontSize: "12px", color: colors.muted }}>
              By creating an account you agree to our terms and privacy policy.
            </p>
          ) : null}
        </form>
      </Card>
      <div style={{ flex: "1 1 300px", minWidth: 0 }}>
        <Summary plan={plan} audit={audit} />
      </div>
    </div>
  );
}
