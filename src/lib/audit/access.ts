import { unlockCookieName } from "./run";
import { getStore } from "./store";

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/**
 * True when this visitor has unlocked the full report, either with the
 * cookie set when they gave their email or with the key in the emailed link.
 */
export async function hasFullAccess(request: Request, auditId: string): Promise<boolean> {
  const fromLink = new URL(request.url).searchParams.get("key");
  const token = fromLink || readCookie(request, unlockCookieName(auditId));
  if (!token || !/^[a-f0-9]{48}$/.test(token)) return false;
  return (await getStore().findLead(auditId, token)) !== null;
}

/** Cookie that keeps the full report unlocked in this browser for 30 days. */
export function unlockCookie(auditId: string, token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${unlockCookieName(auditId)}=${token}; Path=/; Max-Age=${30 * 86_400}; HttpOnly; SameSite=Lax${secure}`;
}
