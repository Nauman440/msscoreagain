import { allowAttempt, clientIp, jsonError, sameOrigin } from "@/lib/account/guard";
import { dummyPasswordHash, verifyPassword } from "@/lib/account/password";
import { SESSION_TTL_MS, sessionCookie } from "@/lib/account/session";
import { getAccountStore } from "@/lib/account/store";
import { ONBOARDING_DONE } from "@/lib/account/types";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("This form must be sent from the MSScore website.", 403);
  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError("Something went wrong with the form. Please try again.", 400);
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return jsonError("Enter your email and password.", 400);

  const ip = clientIp(request);
  if (!allowAttempt(`login-ip:${ip}`, 20, 900_000) || !allowAttempt(`login-email:${email}`, 8, 900_000)) {
    return jsonError("Too many attempts. Please wait 15 minutes and try again.", 429);
  }

  const store = getAccountStore();
  const found = await store.findLogin(email);
  // Check a dummy hash for unknown emails so the response time does not reveal which emails exist.
  const ok = await verifyPassword(password, found?.passwordHash ?? (await dummyPasswordHash()));
  if (!found || !ok) return jsonError("That email and password do not match.", 401);

  const token = await store.createSession(found.user.id, SESSION_TTL_MS);
  const business = await store.businessForUser(found.user.id);
  const next = business && business.onboardingStep < ONBOARDING_DONE ? "/signup" : "/dashboard";
  return Response.json({ ok: true, next }, { headers: { "set-cookie": sessionCookie(token), "cache-control": "no-store" } });
}
