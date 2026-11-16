/** Checks shared by the account API routes. */

/**
 * Refuses form posts sent from other websites (cross-site request forgery).
 * Browsers send an Origin header on every POST; it must match this site.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function clientIp(request: Request): string {
  return (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}

const attempts = ((globalThis as unknown as { __msscoreAttempts?: Map<string, number[]> }).__msscoreAttempts ??= new Map<string, number[]>());

/**
 * Counts an attempt for a key and returns false once the limit for the window is reached.
 * Kept in memory, so on serverless hosting it only slows down guessing on each server.
 */
export function allowAttempt(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) {
    attempts.set(key, recent);
    return false;
  }
  recent.push(now);
  attempts.set(key, recent);
  if (attempts.size > 10_000) {
    for (const [k, times] of attempts) if (times.every((time) => now - time >= windowMs)) attempts.delete(k);
  }
  return true;
}

export function jsonError(message: string, status: number, field?: string): Response {
  return Response.json({ error: message, fields: field ? { [field]: message } : undefined }, { status, headers: { "cache-control": "no-store" } });
}

/** A 400 response that marks several form fields at once. */
export function fieldsError(fields: Record<string, string>): Response {
  return Response.json(
    { error: "Please check the highlighted fields.", fields },
    { status: 400, headers: { "cache-control": "no-store" } },
  );
}
