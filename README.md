# MSScore

SEO audits and automatic fixes for local businesses. This repository holds the
marketing homepage and the free SEO audit with its report page.

## What works today

- **Homepage** (`/`), built from the design. Every "Get my free audit" form starts a real audit.
- **Free audit engine** (`src/lib/audit`). It crawls up to 50 pages (breadth first from the
  homepage, then pages only found in the sitemap) in about 40 seconds and checks:
  - indexing: noindex tags, robots.txt rules, AI crawler access
  - status codes, redirects, canonical tags, http/https/www variants
  - sitemap.xml validity, broken sitemap URLs, pages missing from the sitemap
  - structured data, click depth, orphan pages
  - titles, meta descriptions, H1s, image alt text, thin content
  - trust signals (reviews, testimonials, licences, guarantees, click-to-call)
  - mobile viewport, HTTPS, mixed content, security headers
  - Core Web Vitals through Google PageSpeed Insights (real-visitor data when Google has it)
- **Report page** (`/report/[id]`), built from the design, filled with live results. It shows
  progress while the audit runs, then the score, six category scores and every check.
- **Email gate**: visitors see three affected pages per issue. Giving an email saves a lead,
  unlocks the full list and emails a private report link (`?key=...`).
- **Corrected sitemap download** built from the indexable pages found.
- One audit per site is reused for 30 days, and each visitor can start 10 audits an hour.

Not built yet: payment and accounts, onboarding, the follow-up email sequence,
DataForSEO keyword and competitor research, and applying fixes.

## Scoring

Each check scores from 0 to 1 and carries a weight. A problem on any page costs 40% of that
check, and the rest scales with how many pages are affected, reaching zero at a third of the
pages. Category scores are weighted averages of their checks. The overall score weights the
categories: technical 30%, on-page 25%, speed 15%, mobile 10%, security 10%, AI search 10%.
Categories that could not be measured (for example speed when PageSpeed is unavailable) are
left out rather than counted as zero. The "after fixes" estimate re-scores with every critical
and high issue passing. See `src/lib/audit/scoring.ts` and `src/lib/audit/analyze.ts`.

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. Without `DATABASE_URL`, audits are kept in memory.

To audit the bundled test website, which has known problems:

```bash
npm run fixture
```

```bash
AUDIT_ALLOW_PRIVATE_HOSTS=1 AUDIT_SKIP_PAGESPEED=1 npm run dev
```

Then audit `http://127.0.0.1:4010`.

## Tests

```bash
npm test
```

```bash
npm run typecheck
```

## Deploy to Railway

1. Create a project on Railway and choose **Deploy from GitHub repo**, then pick this repository.
2. Add a **PostgreSQL** service to the project. In the web service's Variables, add
   `DATABASE_URL` referencing the PostgreSQL service's `DATABASE_URL`. Tables are created
   automatically on first use.
3. Add `PUBLIC_BASE_URL` (the service's public address) and, when ready, `PAGESPEED_API_KEY`,
   `RESEND_API_KEY` and `EMAIL_FROM`. See `.env.example` for every setting.
4. Under Settings, Networking, generate a public domain. Every push to `main` redeploys.

Audits run inside the web server process, so the app needs a long-running Node.js server
(Railway, Render or a VPS). It does not work on serverless hosting such as Vercel functions.
A separate worker and queue can be added when traffic needs it.

## Security

The server fetches addresses typed by anonymous visitors. `src/lib/audit/net.ts` refuses
private, local and cloud-metadata addresses, checking the resolved IP at connection time and
on every redirect. Never set `AUDIT_ALLOW_PRIVATE_HOSTS` in production.
