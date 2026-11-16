import { unlockCookie } from "@/lib/audit/access";
import { loadAudit } from "@/lib/audit/run";
import { getStore } from "@/lib/audit/store";
import { allowAttempt, clientIp, fieldsError, jsonError, sameOrigin } from "@/lib/account/guard";
import { hashPassword } from "@/lib/account/password";
import { SESSION_TTL_MS, sessionCookie } from "@/lib/account/session";
import { EmailTakenError, getAccountStore } from "@/lib/account/store";
import type { BusinessProfile } from "@/lib/account/types";
import * as v from "@/lib/account/validate";
import { storageMissingOnServerless } from "@/lib/db";
import { isPlanId } from "@/lib/plans";

/**
 * Creates the owner's account and business, then logs them in.
 * Payment is not set up yet, so paid plans start as "pending_payment".
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("This form must be sent from the MSScore website.", 403);
  if (storageMissingOnServerless()) return jsonError("Sign-up is not available yet: the site's database is not connected.", 503);
  if (!allowAttempt(`signup:${clientIp(request)}`, 5, 3_600_000)) {
    return jsonError("Too many sign-ups from your network. Please try again in an hour.", 429);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Something went wrong with the form. Please try again.", 400);
  }

  if (!isPlanId(body.plan)) return jsonError("Choose a plan first.", 400);
  const plan = body.plan;
  let fields;
  try {
    fields = v.collect({
      name: () => v.text(body, "name", "your name", { required: true, max: 120 }),
      businessName: () => v.text(body, "businessName", "your business name", { required: true, max: 160 }),
      email: () => v.email(body),
      phone: () => v.phone(body),
      password: () => v.password(body),
    });
  } catch (error) {
    if (error instanceof v.FieldErrors) return fieldsError(error.fields);
    throw error;
  }

  // Attach the free audit the visitor ran, and prefill the website from it.
  const auditId = typeof body.auditId === "string" ? body.auditId : null;
  const audit = auditId ? await loadAudit(auditId) : null;
  const profile: BusinessProfile = {};
  if (audit?.result?.site.platform && audit.result.site.platform !== "other") profile.platform = audit.result.site.platform;
  const website = audit?.result?.site.finalUrl ?? (audit ? audit.inputUrl : "");

  try {
    const store = getAccountStore();
    const { user } = await store.createAccount({
      email: fields.email,
      name: fields.name,
      phone: fields.phone,
      passwordHash: await hashPassword(fields.password),
      businessName: fields.businessName,
      website,
      plan,
      planStatus: plan === "full" ? "quote_requested" : "pending_payment",
      auditId: audit?.id ?? null,
      profile,
    });
    const token = await store.createSession(user.id, SESSION_TTL_MS);
    const headers = new Headers({ "cache-control": "no-store" });
    headers.append("set-cookie", sessionCookie(token));
    // The owner gets the full audit report without the email step.
    if (audit?.status === "done") {
      const lead = await getStore().saveLead(audit.id, fields.email);
      headers.append("set-cookie", unlockCookie(audit.id, lead.unlockToken));
    }
    return Response.json({ ok: true, next: "/signup" }, { status: 201, headers });
  } catch (error) {
    if (error instanceof EmailTakenError) {
      return jsonError("An account with this email already exists. Log in instead.", 409, "email");
    }
    console.error("[signup] failed", error);
    return jsonError("We could not create your account. Please try again.", 500);
  }
}
