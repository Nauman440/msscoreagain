import { jsonError, sameOrigin } from "@/lib/account/guard";
import { clearedSessionCookie, sessionToken } from "@/lib/account/session";
import { getAccountStore } from "@/lib/account/store";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return jsonError("This form must be sent from the MSScore website.", 403);
  const token = sessionToken(request);
  if (token) await getAccountStore().deleteSession(token);
  return Response.json({ ok: true }, { headers: { "set-cookie": clearedSessionCookie(), "cache-control": "no-store" } });
}
