import type { BusinessProfile, Platform } from "./types";

/** Validation for the sign-up and onboarding forms. Each failure names the field it belongs to. */

export class FieldError extends Error {
  constructor(public field: string, message: string) {
    super(message);
  }
}

/** Several field errors at once, so the form can mark every problem in one go. */
export class FieldErrors extends Error {
  constructor(public fields: Record<string, string>) {
    super(Object.values(fields)[0] ?? "Check the form.");
  }
}

/** Runs each reader and gathers every FieldError instead of stopping at the first. */
export function collect<T extends Record<string, unknown>>(readers: { [K in keyof T]: () => T[K] }): T {
  const values = {} as T;
  const errors: Record<string, string> = {};
  for (const key of Object.keys(readers) as (keyof T)[]) {
    try {
      values[key] = readers[key]();
    } catch (error) {
      if (!(error instanceof FieldError)) throw error;
      errors[error.field] = error.message;
    }
  }
  if (Object.keys(errors).length) throw new FieldErrors(errors);
  return values;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PLATFORMS: Platform[] = ["wordpress", "shopify", "wix", "squarespace", "other"];

type Body = Record<string, unknown>;

export function text(body: Body, field: string, label: string, opts: { required?: boolean; max?: number } = {}): string {
  const raw = body[field];
  const value = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (opts.required && !value) throw new FieldError(field, `Enter ${label}.`);
  if (value.length > (opts.max ?? 200)) throw new FieldError(field, `${label.charAt(0).toUpperCase()}${label.slice(1)} is too long.`);
  return value;
}

/** Longer free text (lists of services, areas). Keeps line breaks. */
export function longText(body: Body, field: string, label: string, opts: { required?: boolean } = {}): string {
  const raw = body[field];
  const value = typeof raw === "string" ? raw.trim().replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n") : "";
  if (opts.required && !value) throw new FieldError(field, `Enter ${label}.`);
  if (value.length > 2_000) throw new FieldError(field, `That list is too long. Keep it under 2,000 characters.`);
  return value;
}

export function email(body: Body): string {
  const value = text(body, "email", "your email address", { required: true, max: 254 }).toLowerCase();
  if (!EMAIL.test(value)) throw new FieldError("email", "Enter a valid email address.");
  return value;
}

export function password(body: Body): string {
  const value = typeof body.password === "string" ? body.password : "";
  if (value.length < 8) throw new FieldError("password", "Use at least 8 characters for your password.");
  if (value.length > 200) throw new FieldError("password", "That password is too long.");
  return value;
}

export function phone(body: Body): string {
  const value = text(body, "phone", "your phone number", { required: true, max: 40 });
  if ((value.match(/\d/g) ?? []).length < 7) throw new FieldError("phone", "Enter a phone number with at least 7 digits.");
  return value;
}

/** A website address, stored as https://host/ unless the owner typed http. */
export function website(body: Body): string {
  let value = text(body, "website", "your website address", { required: true, max: 500 });
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    if (!url.hostname.includes(".")) throw new Error();
    url.hash = "";
    return url.href;
  } catch {
    throw new FieldError("website", "Enter a website address like yourdomain.com.");
  }
}

/** The platform, if one was sent. Owners are not asked; it is detected from the audit. */
export function platform(body: Body): Platform | undefined {
  const value = body.platform;
  return typeof value === "string" && (PLATFORMS as string[]).includes(value) ? (value as Platform) : undefined;
}

/** Reads the fields of one onboarding step into the profile. */
export function profileStep(step: number, body: Body): { profile: BusinessProfile; website?: string } {
  switch (step) {
    case 2: {
      const values = collect({ website: () => website(body) });
      const detected = platform(body);
      return { website: values.website, profile: detected ? { platform: detected } : {} };
    }
    case 3:
      return {
        profile: collect({
          country: () => text(body, "country", "your country", { required: true, max: 80 }),
          targetCountries: () => text(body, "targetCountries", "the countries you serve", { max: 300 }),
          serviceAreas: () => longText(body, "serviceAreas", "the cities or areas you serve", { required: true }),
          language: () => text(body, "language", "your website language", { required: true, max: 60 }),
        }),
      };
    case 4:
      return {
        profile: collect({
          mainServices: () => longText(body, "mainServices", "your main services", { required: true }),
          topServices: () => longText(body, "topServices", "your most profitable services"),
          competitors: () => longText(body, "competitors", "your competitors"),
        }),
      };
    case 5: {
      const access = (body.access ?? {}) as Record<string, unknown>;
      return {
        profile: {
          access: {
            searchConsole: access.searchConsole === true,
            analytics: access.analytics === true,
            businessProfile: access.businessProfile === true,
            website: access.website === true,
          },
        },
      };
    }
    default:
      throw new FieldError("step", "Unknown onboarding step.");
  }
}
