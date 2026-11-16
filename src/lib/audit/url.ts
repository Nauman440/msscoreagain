/** URL helpers shared by the crawler and the checks. */

const SKIP_EXTENSIONS =
  /\.(?:jpe?g|png|gif|webp|avif|svg|ico|bmp|tiff?|pdf|docx?|xlsx?|pptx?|zip|rar|gz|tar|7z|mp[34]|mov|avi|webm|wav|ogg|css|js|mjs|json|xml|rss|atom|txt|woff2?|ttf|eot|otf|exe|dmg|apk)$/i;

const TRACKING_PARAMS = /^(?:utm_[a-z]+|gclid|fbclid|msclkid|mc_[a-z]+|_ga|_gl|ref|replytocom|share|add-to-cart|orderby|sort|filter_[a-z_]+)$/i;

/** Paths that are normally kept out of search on purpose, so blocking them is not a problem. */
const UTILITY_PATHS =
  /^\/(?:wp-admin|wp-login|wp-json|admin|login|logout|signin|signup|register|account|my-account|cart|basket|checkout|order|orders|search|feed|cgi-bin|thank-you|thanks|preview|tag|author)(?:[/.?]|$)|[?&](?:s|q|search)=/i;

export class InvalidUrlError extends Error {}

/** Turns what a visitor typed ("example.com", "www.example.com/page") into a URL to start from. */
export function parseInputUrl(input: string): URL {
  let raw = input.trim();
  if (!raw) throw new InvalidUrlError("Enter your website address, for example yourdomain.com.");
  if (raw.length > 2000) throw new InvalidUrlError("That address is too long.");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new InvalidUrlError("That does not look like a website address. Try something like yourdomain.com.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new InvalidUrlError("Only http and https websites can be audited.");
  }
  if (url.username || url.password) throw new InvalidUrlError("Remove the username and password from the address.");
  if (!url.hostname.includes(".") || url.hostname.endsWith(".")) {
    throw new InvalidUrlError("That does not look like a website address. Try something like yourdomain.com.");
  }
  url.hash = "";
  return url;
}

/** Host without a leading "www.", used to treat both variants as the same site. */
export function bareHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

export function sameSite(a: string, b: string): boolean {
  return bareHost(a) === bareHost(b);
}

/**
 * Canonical form of a link found on a page, or null when it should not be crawled
 * (other sites, files, mailto links and so on).
 */
export function normalizeLink(href: string, base: string, siteHost: string): string | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  if (/^(?:mailto|tel|sms|javascript|data|whatsapp|skype|callto|fax|blob|about):/i.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(trimmed, base);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!sameSite(url.hostname, siteHost)) return null;
  if (url.port && url.port !== "80" && url.port !== "443" && url.port !== new URL(base).port) return null;
  url.hash = "";
  if (SKIP_EXTENSIONS.test(url.pathname)) return null;
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  if ([...url.searchParams.keys()].length > 2) return null;
  url.searchParams.sort();
  if (url.href.length > 500) return null;
  return url.href;
}

export function isUtilityPath(pathWithQuery: string): boolean {
  return UTILITY_PATHS.test(pathWithQuery);
}

export function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

/** Compares two URLs while ignoring a trailing slash, the scheme and "www.". */
export function sameUrl(a: string, b: string): boolean {
  const key = (value: string) => {
    try {
      const u = new URL(value);
      return `${bareHost(u.hostname)}${u.pathname.replace(/\/+$/, "")}${u.search}`;
    } catch {
      return value;
    }
  };
  return key(a) === key(b);
}
