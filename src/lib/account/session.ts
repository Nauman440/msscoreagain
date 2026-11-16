import { cookies } from "next/headers";
import { getAccountStore } from "./store";
import type { Business, User } from "./types";

export const SESSION_COOKIE = "msscore_session";
export const SESSION_TTL_MS = 30 * 86_400_000;

function cookieValue(name: string, value: string, maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${value}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secure}`;
}

/** Set-Cookie header that logs the browser in. */
export function sessionCookie(token: string): string {
  return cookieValue(SESSION_COOKIE, token, SESSION_TTL_MS / 1000);
}

/** Set-Cookie header that logs the browser out. */
export function clearedSessionCookie(): string {
  return cookieValue(SESSION_COOKIE, "", 0);
}

function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function sessionToken(request: Request): string | null {
  const token = readCookie(request, SESSION_COOKIE);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export interface Account {
  user: User;
  business: Business | null;
}

async function accountFor(token: string | null | undefined): Promise<Account | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const store = getAccountStore();
  const user = await store.userForSession(token);
  if (!user) return null;
  return { user, business: await store.businessForUser(user.id) };
}

/** The logged-in account for an API request. */
export function accountFromRequest(request: Request): Promise<Account | null> {
  return accountFor(sessionToken(request));
}

/** The logged-in account in a server-rendered page. */
export async function currentAccount(): Promise<Account | null> {
  return accountFor((await cookies()).get(SESSION_COOKIE)?.value);
}
