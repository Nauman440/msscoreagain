import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SignupFlow from "@/components/account/SignupFlow";
import { currentAccount } from "@/lib/account/session";
import { ONBOARDING_DONE } from "@/lib/account/types";
import { loadAudit } from "@/lib/audit/run";
import { isPlanId, PLANS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Get started | MSScore",
  robots: { index: false, follow: false },
};

/**
 * Sign-up and onboarding. New visitors start at step 1 (create the account);
 * owners who are logged in continue from the step they reached.
 * Payment is skipped for now and will sit before step 1 later.
 */
export default async function SignupPage(props: PageProps<"/signup">) {
  const params = await props.searchParams;
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const account = await currentAccount();
  const business = account?.business ?? null;

  if (
    business &&
    business.onboardingStep >= ONBOARDING_DONE &&
    !first(params.step)
  )
    redirect("/dashboard");

  const planParam = first(params.plan);
  const plan = business
    ? PLANS[business.plan]
    : PLANS[isPlanId(planParam) ? planParam : "growth"];
  const auditId = business?.auditId ?? first(params.audit) ?? null;
  const audit = auditId ? await loadAudit(auditId) : null;

  let startStep = 1;
  if (business) {
    const asked = Number(first(params.step));
    const reached = Math.min(business.onboardingStep, 5);
    startStep =
      Number.isInteger(asked) && asked >= 2 && asked <= reached
        ? asked
        : reached;
  }

  const result = audit?.result;
  return (
    <SignupFlow
      // A new key once the account exists, so the form starts again at the saved step.
      key={business ? `${business.id}-${startStep}` : "new"}
      plan={plan}
      auditId={audit?.id ?? null}
      audit={
        result
          ? {
              host: result.site.host,
              score: result.scores.overall,
              issues: result.issueTotal,
              critical: result.severityCounts.critical,
            }
          : null
      }
      business={business}
      userName={account?.user.name ?? null}
      startStep={startStep}
    />
  );
}
