import type { CoreWebVitals } from "./types";

/**
 * Core Web Vitals from Google PageSpeed Insights (mobile).
 *
 * Works without a key at low volume. Set PAGESPEED_API_KEY (free from Google
 * Cloud) for reliable use. When Google has real-visitor data for the page it is
 * preferred; otherwise the numbers come from a single lab test.
 */

const unavailable = (note: string): CoreWebVitals => ({
  available: false,
  source: null,
  performanceScore: null,
  lcpMs: null,
  inpMs: null,
  tbtMs: null,
  cls: null,
  note,
});

interface PsiResponse {
  loadingExperience?: {
    metrics?: Record<string, { percentile?: number }>;
  };
  lighthouseResult?: {
    categories?: { performance?: { score?: number | null } };
    audits?: Record<string, { numericValue?: number }>;
  };
}

export async function fetchCoreWebVitals(pageUrl: string, timeoutMs = 45_000): Promise<CoreWebVitals> {
  if (process.env.AUDIT_SKIP_PAGESPEED === "1") return unavailable("Speed test is turned off.");
  const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  endpoint.searchParams.set("url", pageUrl);
  endpoint.searchParams.set("strategy", "mobile");
  endpoint.searchParams.set("category", "performance");
  if (process.env.PAGESPEED_API_KEY) endpoint.searchParams.set("key", process.env.PAGESPEED_API_KEY);
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      return unavailable(
        response.status === 429
          ? "The speed test service is busy. Run the audit again later for speed results."
          : "The speed test could not be completed for this website.",
      );
    }
    const data = (await response.json()) as PsiResponse;
    const audits = data.lighthouseResult?.audits ?? {};
    const field = data.loadingExperience?.metrics ?? {};
    const score = data.lighthouseResult?.categories?.performance?.score;
    const fieldLcp = field.LARGEST_CONTENTFUL_PAINT_MS?.percentile;
    const fieldInp = field.INTERACTION_TO_NEXT_PAINT?.percentile;
    const fieldCls = field.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile;
    const hasField = fieldLcp !== undefined && fieldCls !== undefined;
    const lcpMs = hasField ? fieldLcp : audits["largest-contentful-paint"]?.numericValue;
    const cls = hasField ? fieldCls / 100 : audits["cumulative-layout-shift"]?.numericValue;
    if (lcpMs === undefined || cls === undefined) {
      return unavailable("The speed test returned no measurements for this website.");
    }
    return {
      available: true,
      source: hasField ? "field" : "lab",
      performanceScore: typeof score === "number" ? Math.round(score * 100) : null,
      lcpMs: Math.round(lcpMs),
      inpMs: hasField && fieldInp !== undefined ? Math.round(fieldInp) : null,
      tbtMs: audits["total-blocking-time"]?.numericValue !== undefined
        ? Math.round(audits["total-blocking-time"].numericValue)
        : null,
      cls: Math.round(cls * 100) / 100,
      note: hasField
        ? "Measured from real visitors on mobile over the last 28 days (Google Chrome data)."
        : "Measured in a single mobile lab test. Real visitors may see different numbers.",
    };
  } catch {
    return unavailable("The speed test timed out for this website.");
  }
}
