import { fieldsError, jsonError, sameOrigin } from "@/lib/account/guard";
import { accountFromRequest } from "@/lib/account/session";
import { getAccountStore } from "@/lib/account/store";
import { ONBOARDING_DONE } from "@/lib/account/types";
import { FieldError, FieldErrors, profileStep } from "@/lib/account/validate";

/**
 * Saves one onboarding step (2 to 5) for the logged-in owner.
 * Step 5 records the owner's consent: the tool must never change their
 * website before ownership is verified and consent is recorded.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("This form must be sent from the MSScore website.", 403);
  const account = await accountFromRequest(request);
  if (!account?.business) return jsonError("Your session has ended. Please log in again.", 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Something went wrong with the form. Please try again.", 400);
  }
  const step = Number(body.step);
  if (!Number.isInteger(step) || step < 2 || step > 5) return jsonError("Unknown onboarding step.", 400);
  if (step > account.business.onboardingStep) return jsonError("Please finish the earlier steps first.", 400);

  try {
    const { profile, website } = profileStep(step, body);
    if (step === 5 && body.consent !== true && !account.business.consentAt) {
      throw new FieldError("consent", "Please confirm how we may work on your website to finish setup.");
    }
    const business = await getAccountStore().updateBusiness(account.business.id, {
      website,
      profile,
      onboardingStep: Math.max(account.business.onboardingStep, step + 1),
      consentAt: step === 5 && !account.business.consentAt ? new Date().toISOString() : undefined,
    });
    return Response.json(
      { ok: true, business, next: business.onboardingStep >= ONBOARDING_DONE ? "/dashboard" : null },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof FieldErrors) return fieldsError(error.fields);
    if (error instanceof FieldError) return jsonError(error.message, 400, error.field);
    console.error("[onboarding] failed", error);
    return jsonError("We could not save this step. Please try again.", 500);
  }
}
