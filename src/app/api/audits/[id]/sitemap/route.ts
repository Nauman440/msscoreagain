import { loadAudit } from "@/lib/audit/run";

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** A corrected sitemap.xml built from the indexable pages the audit found. */
export async function GET(_request: Request, ctx: RouteContext<"/api/audits/[id]/sitemap">) {
  const { id } = await ctx.params;
  const record = await loadAudit(id);
  if (!record?.result) return new Response("Report not found or not finished.", { status: 404 });
  const urls = record.result.sitemap.indexableUrls;
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`),
    "</urlset>",
    "",
  ].join("\n");
  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "content-disposition": 'attachment; filename="sitemap.xml"',
      "cache-control": "no-store",
    },
  });
}
