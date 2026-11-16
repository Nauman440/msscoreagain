import { hasFullAccess } from "@/lib/audit/access";
import { loadAudit, previewResult } from "@/lib/audit/run";

/**
 * Audit status and report. While the audit runs, the result is null and
 * `progress` says how far it got. Visitors who have not given an email get
 * the preview, with a few affected pages per issue.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/audits/[id]">) {
  const { id } = await ctx.params;
  const record = await loadAudit(id);
  if (!record) return Response.json({ error: "Audit not found." }, { status: 404 });
  const unlocked = record.status === "done" && (await hasFullAccess(request, id));
  const result = record.result ? (unlocked ? record.result : previewResult(record.result)) : null;
  return Response.json(
    {
      id: record.id,
      host: record.host,
      status: record.status,
      progress: record.progress,
      error: record.error,
      createdAt: record.createdAt,
      unlocked,
      result,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
