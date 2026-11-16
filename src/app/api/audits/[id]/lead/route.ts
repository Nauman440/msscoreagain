import { unlockCookie } from "@/lib/audit/access";
import { loadAudit } from "@/lib/audit/run";
import { getStore } from "@/lib/audit/store";
import { sendReportEmail } from "@/lib/email";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Saves the visitor's email, unlocks the full report and emails them the link. Body: { "email": "..." }. */
export async function POST(request: Request, ctx: RouteContext<"/api/audits/[id]/lead">) {
  const { id } = await ctx.params;
  const record = await loadAudit(id);
  if (!record) return Response.json({ error: "Audit not found." }, { status: 404 });
  if (record.status !== "done" || !record.result) {
    return Response.json({ error: "The report is not ready yet. Try again in a moment." }, { status: 409 });
  }
  let email = "";
  try {
    const body = (await request.json()) as { email?: unknown };
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    // Falls through to the validation message below.
  }
  if (!EMAIL.test(email) || email.length > 254) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const lead = await getStore().saveLead(id, email);
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") || new URL(request.url).origin;
  const reportUrl = `${base}/report/${id}?key=${lead.unlockToken}`;
  let emailed = false;
  try {
    emailed = await sendReportEmail({ to: email, host: record.host, reportUrl, score: record.result.scores.overall });
  } catch (error) {
    console.error(`[lead ${id}] report email failed`, error);
  }

  return Response.json(
    { ok: true, emailed, result: record.result },
    { headers: { "set-cookie": unlockCookie(id, lead.unlockToken), "cache-control": "no-store" } },
  );
}
