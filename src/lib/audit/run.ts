import { analyze } from "./analyze";
import { auditConfig } from "./config";
import { AuditError, crawlSite } from "./crawl";
import { assertPublicUrl } from "./net";
import { fetchCoreWebVitals } from "./psi";
import { getStore } from "./store";
import type { AuditRecord, AuditResult, Issue } from "./types";
import { bareHost, InvalidUrlError, parseInputUrl } from "./url";

/**
 * Audits run after the "audit started" response has been sent. The API route
 * hands the job to Next.js `after()`, which keeps the function alive for it on
 * serverless hosting (Vercel) and simply runs it in the background on a normal
 * Node.js server (Railway, a VPS). Either way the whole audit must finish
 * within auditConfig.totalBudgetMs.
 */
const state = globalThis as unknown as {
  __msscoreRunning?: Set<string>;
  __msscoreWaiting?: (() => void)[];
  __msscoreHits?: Map<string, number[]>;
};
const running = (state.__msscoreRunning ??= new Set<string>());
const waiting = (state.__msscoreWaiting ??= []);
const hits = (state.__msscoreHits ??= new Map<string, number[]>());

/**
 * An audit that has made no progress for this long is treated as lost, for
 * example when the server restarted or the host stopped the function.
 */
const STALE_MS = 90_000;

export class RateLimitError extends Error {}

function checkRateLimit(ip: string): void {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((time) => now - time < 3_600_000);
  if (recent.length >= auditConfig.perIpPerHour) {
    throw new RateLimitError("You have run several audits in the last hour. Please try again later.");
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5_000) {
    for (const [key, times] of hits) {
      if (times.every((time) => now - time >= 3_600_000)) hits.delete(key);
    }
  }
}

class TimeUpError extends Error {}

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeUpError()), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

async function execute(id: string, input: URL): Promise<void> {
  const store = getStore();
  const started = Date.now();
  if (running.size >= auditConfig.maxConcurrentAudits) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  running.add(id);
  let lastWrite = 0;
  let finished = false;
  try {
    const budget = auditConfig.totalBudgetMs - (Date.now() - started);
    await withDeadline(
      (async () => {
        await store.setProgress(id, { stage: "Opening your website", pagesCrawled: 0, pageCap: auditConfig.pageCap });
        // The speed test takes 15 to 30 seconds, so it runs alongside the crawl.
        const cwvPromise = fetchCoreWebVitals(input.href, Math.max(5_000, budget - 4_000));
        const crawl = await crawlSite(input, (pagesCrawled, stage) => {
          const now = Date.now();
          if (finished || now - lastWrite < 1_000) return;
          lastWrite = now;
          void store.setProgress(id, { stage, pagesCrawled, pageCap: auditConfig.pageCap }).catch(() => undefined);
        });
        await store.setProgress(id, {
          stage: "Measuring speed and scoring",
          pagesCrawled: crawl.pages.length,
          pageCap: auditConfig.pageCap,
        });
        const cwv = await cwvPromise;
        finished = true;
        await store.complete(id, analyze(crawl, cwv));
      })(),
      budget,
    );
  } catch (error) {
    finished = true;
    let message = "Something went wrong while auditing this website. Please try again.";
    if (error instanceof AuditError) message = error.message;
    else if (error instanceof TimeUpError) message = "The website responded too slowly for the free audit to finish. Please try again.";
    else console.error(`[audit ${id}] failed`, error);
    await store.fail(id, message).catch((failError) => console.error(`[audit ${id}] could not save failure`, failError));
  } finally {
    running.delete(id);
    waiting.shift()?.();
  }
}

function isStale(record: AuditRecord): boolean {
  return (
    (record.status === "running" || record.status === "queued") &&
    Date.now() - new Date(record.updatedAt).getTime() > STALE_MS
  );
}

export interface StartedAudit {
  id: string;
  reused: boolean;
  /** The audit itself. Null when an earlier report was reused. The caller must run it. */
  run: (() => Promise<void>) | null;
}

/**
 * Creates an audit record and returns the job that fills it. If the same site
 * was audited recently, that report is returned instead of crawling again.
 */
export async function startAudit(rawUrl: string, ip: string): Promise<StartedAudit> {
  const input = parseInputUrl(rawUrl);
  try {
    assertPublicUrl(input);
  } catch (error) {
    throw new InvalidUrlError(error instanceof Error ? error.message : "That address is not a public website.");
  }
  const host = bareHost(input.hostname);
  const store = getStore();
  if (auditConfig.reuseDays > 0) {
    const since = new Date(Date.now() - auditConfig.reuseDays * 86_400_000);
    const recent = await store.findRecent(host, since);
    if (recent && !isStale(recent)) return { id: recent.id, reused: true, run: null };
  }
  checkRateLimit(ip);
  const record = await store.create({ host, inputUrl: input.href, pageCap: auditConfig.pageCap });
  return { id: record.id, reused: false, run: () => execute(record.id, input) };
}

/** Loads an audit, marking it failed if it stopped making progress. */
export async function loadAudit(id: string): Promise<AuditRecord | null> {
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  const store = getStore();
  const record = await store.get(id);
  if (!record) return null;
  if (isStale(record) && !running.has(id)) {
    const error = "This audit was interrupted. Please run it again.";
    await store.fail(id, error).catch(() => undefined);
    return { ...record, status: "failed", error };
  }
  return record;
}

/** The report a visitor sees before giving an email: a few affected pages per issue. */
export function previewResult(result: AuditResult): AuditResult {
  const issues: Issue[] = result.issues.map((issue) =>
    issue.affected.length > auditConfig.previewExamples
      ? { ...issue, affected: issue.affected.slice(0, auditConfig.previewExamples), truncated: true }
      : issue,
  );
  return { ...result, issues };
}

export const unlockCookieName = (auditId: string) => `msscore_unlock_${auditId}`;
