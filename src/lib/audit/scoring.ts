import type { Category, Issue, Severity } from "./types";

/** One scored check. `score` runs from 0 (failing everywhere) to 1 (passing). */
export interface Check {
  id: string;
  category: Category;
  severity: Severity;
  weight: number;
  score: number;
  issue?: Omit<Issue, "id" | "category" | "severity" | "count"> & { count?: number };
}

/** Share of the overall score each category carries. */
export const CATEGORY_WEIGHTS: Record<Category, number> = {
  technical: 0.3,
  onpage: 0.25,
  speed: 0.15,
  mobile: 0.1,
  security: 0.1,
  ai: 0.1,
};

/**
 * Score for a problem that affects some of the pages. Any occurrence costs
 * 40% of the check, and the rest scales with how widespread it is, reaching
 * zero when a third of the pages are affected.
 */
export function ratioScore(affected: number, total: number): number {
  if (affected <= 0 || total <= 0) return 1;
  const ratio = Math.min(1, affected / total);
  return Math.max(0, 1 - (0.4 + 0.6 * Math.min(1, ratio * 3)));
}

export function categoryScores(checks: Check[]): Record<Category, number | null> {
  const out = {} as Record<Category, number | null>;
  for (const category of Object.keys(CATEGORY_WEIGHTS) as Category[]) {
    const own = checks.filter((check) => check.category === category);
    const weight = own.reduce((sum, check) => sum + check.weight, 0);
    out[category] = weight > 0
      ? Math.round((100 * own.reduce((sum, check) => sum + check.weight * check.score, 0)) / weight)
      : null;
  }
  return out;
}

/** Weighted average of the categories that could be measured. */
export function overallScore(categories: Record<Category, number | null>): number {
  let total = 0;
  let weight = 0;
  for (const [category, score] of Object.entries(categories) as [Category, number | null][]) {
    if (score === null) continue;
    total += score * CATEGORY_WEIGHTS[category];
    weight += CATEGORY_WEIGHTS[category];
  }
  return weight > 0 ? Math.round(total / weight) : 0;
}

/** The score the site would have with every critical and high issue fixed. */
export function estimateAfterFixes(checks: Check[]): number {
  const fixed = checks.map((check) =>
    check.score < 1 && (check.severity === "critical" || check.severity === "high") ? { ...check, score: 1 } : check,
  );
  return overallScore(categoryScores(fixed));
}

export function scoreLabel(score: number): string {
  if (score >= 90) return "Great";
  if (score >= 75) return "Good";
  if (score >= 50) return "Needs work";
  return "Poor";
}
