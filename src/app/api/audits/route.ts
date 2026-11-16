import { RateLimitError, startAudit } from "@/lib/audit/run";
import { InvalidUrlError } from "@/lib/audit/url";

/** Starts a free audit. Body: { "url": "yourdomain.com" }. Returns { id }. */
export async function POST(request: Request) {
  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send the website address as JSON: { \"url\": \"yourdomain.com\" }." }, { status: 400 });
  }
  if (typeof body.url !== "string") {
    return Response.json({ error: "Enter your website address, for example yourdomain.com." }, { status: 400 });
  }
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
  try {
    const { id, reused } = await startAudit(body.url, ip);
    return Response.json({ id, reused }, { status: reused ? 200 : 202 });
  } catch (error) {
    if (error instanceof InvalidUrlError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof RateLimitError) return Response.json({ error: error.message }, { status: 429 });
    console.error("[api/audits] could not start audit", error);
    return Response.json({ error: "We could not start the audit. Please try again." }, { status: 500 });
  }
}
