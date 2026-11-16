/** The plans shown on the homepage and the report. Prices match the design. */

export type PlanId = "autopilot" | "growth" | "full";

export interface Plan {
  id: PlanId;
  name: string;
  price: string;
  unit: string;
}

export const PLANS: Record<PlanId, Plan> = {
  autopilot: { id: "autopilot", name: "Autopilot", price: "$79", unit: "/month" },
  growth: { id: "growth", name: "Growth", price: "$229", unit: "/month" },
  full: { id: "full", name: "Full SEO package", price: "Custom", unit: "quote" },
};

export function isPlanId(value: unknown): value is PlanId {
  return value === "autopilot" || value === "growth" || value === "full";
}

/** Link to start sign-up for a plan, carrying the audit the visitor just ran. */
export function signupHref(plan: PlanId, auditId?: string): string {
  const params = new URLSearchParams({ plan });
  if (auditId) params.set("audit", auditId);
  return `/signup?${params.toString()}`;
}
