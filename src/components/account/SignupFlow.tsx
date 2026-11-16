"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Business } from "@/lib/account/types";
import type { Plan } from "@/lib/plans";
import { ChoiceChips, COUNTRIES, ErrorText, Field, icons, PasswordField, TagField, ToggleCard } from "./inputs";
import s from "./onboarding.module.css";

const STEPS = ["About you", "Your website", "Your area", "Your services", "Connect and approve"];
const DONE = STEPS.length + 1;

export interface AuditSummary {
  host: string;
  score: number;
  issues: number;
  critical: number;
}

export interface SignupFlowProps {
  plan: Plan;
  auditId: string | null;
  audit: AuditSummary | null;
  /** Null until the account exists (step 1). */
  business: Business | null;
  /** The owner's name once logged in. */
  userName: string | null;
  /** The step to open on: 1 for new visitors, the saved step for owners coming back. */
  startStep: number;
}

function ScoreRing({ score, size = 72 }: { score: number; size?: number }) {
  const circumference = 2 * Math.PI * 30;
  const color = score >= 80 ? "#15803D" : score >= 50 ? "#F97316" : "#DC2626";
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" role="img" aria-label={`SEO score ${score} percent`}>
      <circle cx="36" cy="36" r="30" fill="none" stroke="#E7E2D8" strokeWidth="7" />
      <circle
        cx="36"
        cy="36"
        r="30"
        fill="none"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${(circumference * score) / 100} ${circumference}`}
        transform="rotate(-90 36 36)"
      />
      <text x="36" y="41" textAnchor="middle" fontSize="17" fontWeight="800" fill="currentColor" fontFamily="Sora, sans-serif">
        {score}%
      </text>
    </svg>
  );
}

function SidePanel({ step, plan, audit, loggedIn }: { step: number; plan: Plan; audit: AuditSummary | null; loggedIn: boolean }) {
  const router = useRouter();
  return (
    <aside className={s.side} aria-label="Your progress">
      <div className={s.brandRow}>
        <Link href="/" className={s.brand}>
          MSScore<span className={s.brandDot}>.</span>
        </Link>
        {loggedIn ? (
          <button
            type="button"
            className={s.sideLink}
            onClick={async () => {
              await fetch("/api/account/logout", { method: "POST" }).catch(() => undefined);
              router.replace("/");
              router.refresh();
            }}
          >
            Log out
          </button>
        ) : (
          <Link href="/login" className={s.sideLink}>
            Log in
          </Link>
        )}
      </div>

      <ol className={s.stepList}>
        {STEPS.map((label, index) => {
          const number = index + 1;
          const done = number < step;
          const active = number === step;
          return (
            <li
              key={label}
              className={`${s.stepItem} ${done ? s.stepItemDone : ""} ${active ? s.stepItemActive : ""}`}
              aria-current={active ? "step" : undefined}
            >
              <span className={s.stepDot} aria-hidden="true">
                {done ? icons.check : number}
              </span>
              {label}
              {done ? <span className={s.visuallyHidden}>, done</span> : null}
            </li>
          );
        })}
      </ol>

      <div className={s.planCard}>
        <div className={s.planLabel}>Your plan</div>
        <div className={s.planRow}>
          <span className={s.planName}>{plan.name}</span>
          <span className={s.planPrice}>
            {plan.price} <span className={s.planUnit}>{plan.unit}</span>
          </span>
        </div>
        <div className={s.noCharge}>
          <span aria-hidden="true">✓</span>
          {plan.id === "full" ? "No payment now. We will send you a quote." : "Nothing to pay today. You will confirm payment before your plan starts."}
        </div>
        {audit ? (
          <div style={{ display: "flex", alignItems: "center", gap: "14px", color: "#ffffff", borderTop: "1px solid #2B3D57", paddingTop: "14px" }}>
            <ScoreRing score={audit.score} size={56} />
            <div style={{ fontSize: "14px", color: "#cbd5e1", minWidth: 0 }}>
              Your free audit for
              <div style={{ color: "#ffffff", fontWeight: 700, overflowWrap: "anywhere" }}>{audit.host}</div>
            </div>
          </div>
        ) : null}
      </div>

      <ul className={s.trust}>
        {["Nothing changes on your site without your approval", "Undo any change in one click", "Cancel anytime"].map((item) => (
          <li key={item}>
            <span style={{ color: "#F97316", display: "flex", marginTop: "2px" }}>{icons.check}</span>
            {item}
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** Reads a form into a plain object. Checkboxes become true or false; only checked radios count. */
function formValues(form: HTMLFormElement): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const element of Array.from(form.elements)) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) continue;
    if (!element.name) continue;
    if (element instanceof HTMLInputElement && element.type === "radio") {
      if (element.checked) values[element.name] = element.value;
      continue;
    }
    values[element.name] = element instanceof HTMLInputElement && element.type === "checkbox" ? element.checked : element.value;
  }
  return values;
}

export default function SignupFlow({ plan, auditId, audit, business: initialBusiness, userName, startStep }: SignupFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState(startStep);
  const [business, setBusiness] = useState(initialBusiness);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [otherCountries, setOtherCountries] = useState(Boolean(initialBusiness?.profile.targetCountries));
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstName = (userName ?? "").split(" ")[0];

  useEffect(() => {
    if (step > 1) headingRef.current?.focus();
  }, [step]);

  const goTo = (next: number) => {
    setStep(next);
    setError(null);
    setFieldErrors({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const values = formValues(event.currentTarget);
    if (values.language === "Other") values.language = values.languageOther;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const isSignup = step === 1;
      let payload: Record<string, unknown>;
      if (isSignup) payload = { ...values, plan: plan.id, auditId };
      else if (step === 5)
        payload = {
          step,
          consent: values.consent,
          access: {
            searchConsole: values.searchConsole,
            analytics: values.analytics,
            businessProfile: values.businessProfile,
            website: values.websiteAccess,
          },
        };
      else payload = { ...values, targetCountries: otherCountries ? values.targetCountries : "", step };

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
          const first = Object.keys(data.fields)[0];
          setTimeout(() => document.getElementById(`f-${first}`)?.focus(), 0);
        } else {
          setError(data.error ?? "Something went wrong. Please try again.");
        }
        return;
      }
      if (isSignup) {
        // Load the page again on the server so it picks up the new login.
        router.replace("/signup?step=2");
        router.refresh();
        return;
      }
      if (data.business) setBusiness(data.business);
      goTo(data.next ? DONE : step + 1);
    } catch {
      setError("We could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const profile = business?.profile ?? {};
  let title: ReactNode = null;
  let intro: ReactNode = null;
  let fields: ReactNode = null;
  let action = "Continue";

  switch (step) {
    case 1:
      title = "Let's get you more customers";
      intro = `Create your account to start ${plan.id === "full" ? "your Full SEO package" : `the ${plan.name} plan`}. It takes about 2 minutes.`;
      action = "Create my account";
      fields = (
        <>
          <div className={s.row}>
            <Field name="name" label="Your name" autoComplete="name" icon={icons.user} error={fieldErrors.name} autoFocus />
            <Field name="businessName" label="Business name" autoComplete="organization" icon={icons.store} error={fieldErrors.businessName} />
          </div>
          <div className={s.row}>
            <Field name="email" label="Email" type="email" inputMode="email" autoComplete="email" icon={icons.mail} error={fieldErrors.email} />
            <Field name="phone" label="Phone" type="tel" inputMode="tel" autoComplete="tel" icon={icons.phone} error={fieldErrors.phone} />
          </div>
          <PasswordField error={fieldErrors.password} />
        </>
      );
      break;
    case 2:
      title = firstName ? `Hi ${firstName}, is this your website?` : "Is this your website?";
      intro = "All our work will focus on this site. Change it if it is not right.";
      fields = (
        <>
          <Field
            name="website"
            label="Website address"
            inputMode="url"
            autoComplete="url"
            placeholder="yourdomain.com"
            icon={icons.globe}
            defaultValue={business?.website}
            error={fieldErrors.website}
          />
          {audit ? (
            <div className={s.auditCard}>
              <ScoreRing score={audit.score} />
              <div className={s.auditStats}>
                <strong>Your free audit found {audit.issues} issues</strong>
                {audit.critical > 0 ? (
                  <span>
                    <span className={s.critical}>{audit.critical} critical</span> {audit.critical === 1 ? "issue is" : "issues are"} hurting you most. We start with {audit.critical === 1 ? "it" : "those"}.
                  </span>
                ) : (
                  <span>No critical issues. We will start with the quickest wins.</span>
                )}
              </div>
            </div>
          ) : null}
        </>
      );
      break;
    case 3:
      title = "Where are your customers?";
      intro = "We will target searches from people in the places you serve.";
      fields = (
        <>
          <Field
            name="country"
            label="Country"
            autoComplete="country-name"
            list="msscore-countries"
            icon={icons.globe}
            defaultValue={profile.country}
            error={fieldErrors.country}
          />
          <datalist id="msscore-countries">
            {COUNTRIES.map((country) => (
              <option key={country} value={country} />
            ))}
          </datalist>
          <TagField
            name="serviceAreas"
            label="Cities and areas you serve"
            hint="Type a place and press Enter. Add as many as you like."
            placeholder="For example: Islamabad"
            defaultValue={profile.serviceAreas}
            error={fieldErrors.serviceAreas}
          />
          {otherCountries ? (
            <TagField
              name="targetCountries"
              label="Other countries you serve"
              optional
              placeholder="For example: United Arab Emirates"
              defaultValue={profile.targetCountries}
              error={fieldErrors.targetCountries}
            />
          ) : (
            <div>
              <button type="button" className={s.linkButton} onClick={() => setOtherCountries(true)}>
                + I also serve customers in other countries
              </button>
            </div>
          )}
          <ChoiceChips
            name="language"
            label="Your website is in"
            options={["English", "Urdu", "Arabic", "Spanish", "French"]}
            defaultValue={profile.language}
            error={fieldErrors.language}
          />
        </>
      );
      break;
    case 4:
      title = "What do you do best?";
      intro = "Add your services. We build your pages and keywords around them.";
      fields = (
        <>
          <TagField
            name="mainServices"
            label="Your services"
            hint="Type a service and press Enter."
            placeholder="For example: AC repair"
            defaultValue={profile.mainServices}
            error={fieldErrors.mainServices}
            starName="topServices"
            starDefault={profile.topServices}
            starHint="Tap ☆ on the services that make you the most money. We will prioritise them."
          />
          <TagField
            name="competitors"
            label="Competitors you know about"
            optional
            hint="Names or websites. We will find others too."
            placeholder="For example: competitor.com"
            defaultValue={profile.competitors}
            error={fieldErrors.competitors}
          />
        </>
      );
      break;
    case 5:
      title = "Last step: connect and approve";
      intro = "Tick what you can give us access to. Nothing is connected today. We will set it up with you.";
      action = "Finish setup";
      fields = (
        <>
          <div className={s.cards}>
            <ToggleCard name="searchConsole" title="Search Console" text="Your real clicks, rankings and indexing problems." icon={icons.search} defaultChecked={profile.access?.searchConsole} />
            <ToggleCard name="analytics" title="Google Analytics" text="Visits, calls and leads from search." icon={icons.chart} defaultChecked={profile.access?.analytics} />
            <ToggleCard name="businessProfile" title="Business Profile" text="Your Google Maps listing and reviews." icon={icons.map} defaultChecked={profile.access?.businessProfile} />
            <ToggleCard name="websiteAccess" title="Website admin" text="So approved fixes can be applied for you." icon={icons.code} defaultChecked={profile.access?.website} />
          </div>
          <div className={s.field}>
            <label className={s.consent}>
              <input
                type="checkbox"
                id="f-consent"
                name="consent"
                defaultChecked={Boolean(business?.consentAt)}
                aria-invalid={fieldErrors.consent ? true : undefined}
                aria-describedby={fieldErrors.consent ? "f-consent-error" : undefined}
              />
              <span>
                <span className={s.consentTitle} style={{ display: "block" }}>
                  I allow MSScore to prepare changes to my website
                </span>
                <span className={s.consentText} style={{ display: "block" }}>
                  Nothing goes live until I approve it. I can undo any change in one click, and nothing changes until my website ownership is verified.
                </span>
              </span>
            </label>
            <ErrorText id="f-consent-error" message={fieldErrors.consent} />
          </div>
        </>
      );
      break;
    default:
      break;
  }

  const progress = Math.min(100, ((Math.min(step, DONE) - 1) / STEPS.length) * 100);

  return (
    <div className={s.page}>
      <SidePanel step={step} plan={plan} audit={audit} loggedIn={Boolean(business)} />
      <div className={s.main}>
        <div className={s.mobileBar}>
          <Link href="/" className={s.brand} style={{ fontSize: "18px" }}>
            MSScore<span className={s.brandDot}>.</span>
          </Link>
          <span>{step < DONE ? `Step ${step} of ${STEPS.length}` : "All set"}</span>
        </div>
        <div
          className={s.progressTrack}
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <div className={s.progressFill} style={{ width: `${progress}%` }} />
        </div>
        <main className={s.content}>
          {step === DONE ? (
            <div className={`${s.panel} ${s.done}`}>
              <div className={s.doneBadge} aria-hidden="true">
                <svg width="44" height="44" viewBox="0 0 16 16">
                  <path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <h1 ref={headingRef} tabIndex={-1} className={s.title}>
                  {firstName ? `You're all set, ${firstName}` : "You're all set"}
                </h1>
                <p className={s.intro}>
                  {business?.name ?? "Your business"} is ready for {plan.name}. Here is what happens next.
                </p>
              </div>
              <ol className={s.doneList}>
                {[
                  plan.id === "full" ? "Our team contacts you with a quote for the Full SEO package." : "We confirm your payment details. You have not been charged.",
                  "We help you connect Search Console, Analytics and your website.",
                  "A specialist reviews your SEO roadmap within 3 to 5 working days.",
                ].map((item, index) => (
                  <li key={item}>
                    <span className={s.doneNumber}>{index + 1}</span>
                    {item}
                  </li>
                ))}
              </ol>
              <Link href="/dashboard" className={s.primary}>
                Go to my dashboard {icons.arrow}
              </Link>
            </div>
          ) : (
            <div key={step} className={s.panel}>
              <div>
                <div className={s.eyebrow}>
                  Step {step} of {STEPS.length} · {STEPS[step - 1]}
                </div>
                <h1 ref={headingRef} tabIndex={-1} className={s.title}>
                  {title}
                </h1>
                <p className={s.intro}>{intro}</p>
              </div>
              <form onSubmit={submit} noValidate className={s.form}>
                {error ? (
                  <div className={s.formError} role="alert">
                    {error}
                  </div>
                ) : null}
                {fields}
                <div className={s.actions}>
                  <button type="submit" disabled={busy} className={s.primary}>
                    {busy ? (
                      <>
                        <span className={s.spinner} aria-hidden="true" /> Saving
                      </>
                    ) : (
                      <>
                        {action} {icons.arrow}
                      </>
                    )}
                  </button>
                  {step > 2 ? (
                    <button type="button" onClick={() => goTo(step - 1)} disabled={busy} className={s.ghost}>
                      Back
                    </button>
                  ) : null}
                </div>
                {step === 1 ? (
                  <>
                    <p className={s.small}>
                      Already have an account? <Link href="/login">Log in</Link>
                    </p>
                    <p className={s.small}>By creating an account you agree to our terms and privacy policy.</p>
                  </>
                ) : null}
              </form>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
