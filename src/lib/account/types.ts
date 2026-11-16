import type { PlanId } from "@/lib/plans";

export interface User {
  id: string;
  email: string;
  name: string;
  phone: string;
  createdAt: string;
}

export type Platform = "wordpress" | "shopify" | "wix" | "squarespace" | "other";
export type PlanStatus = "pending_payment" | "active" | "quote_requested";

/** What the owner tells us during onboarding. Every field is optional until that step is done. */
export interface BusinessProfile {
  platform?: Platform;
  country?: string;
  targetCountries?: string;
  serviceAreas?: string;
  language?: string;
  mainServices?: string;
  topServices?: string;
  competitors?: string;
  /** Accounts the owner says they can give us access to. Real connections come later. */
  access?: { searchConsole: boolean; analytics: boolean; businessProfile: boolean; website: boolean };
}

export interface Business {
  id: string;
  userId: string;
  name: string;
  website: string;
  plan: PlanId;
  planStatus: PlanStatus;
  auditId: string | null;
  /** The next onboarding step to show (2 to 5), or 6 when onboarding is finished. */
  onboardingStep: number;
  /** When the owner agreed that we may prepare changes for their approval. */
  consentAt: string | null;
  profile: BusinessProfile;
  createdAt: string;
  updatedAt: string;
}

export const ONBOARDING_DONE = 6;
