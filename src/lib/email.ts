/**
 * Sends the "your full report" email.
 *
 * With RESEND_API_KEY and EMAIL_FROM set, mail goes out through Resend
 * (resend.com). Without them the email is only logged, so the rest of the
 * flow can be tested before an email provider is chosen.
 */
export async function sendReportEmail(input: { to: string; host: string; reportUrl: string; score: number }): Promise<void> {
  const subject = `Your SEO audit for ${input.host}: score ${input.score}%`;
  const text = [
    `Here is your full SEO audit for ${input.host}.`,
    "",
    `Your SEO health score: ${input.score}%`,
    "",
    `Open your full report: ${input.reportUrl}`,
    "",
    "The report lists every issue we found, the pages affected and how to fix each one.",
    "",
    "MSScore",
    "You received this email because you asked for your SEO report on msscore.",
  ].join("\n");

  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    console.info(`[email] not sent (RESEND_API_KEY or EMAIL_FROM not set): "${subject}" with link ${input.reportUrl}`);
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [input.to], subject, text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Email provider returned ${response.status}`);
  }
}
