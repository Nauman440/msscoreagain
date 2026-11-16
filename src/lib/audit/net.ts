import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { BlockList, isIP } from "node:net";
import { Agent, EnvHttpProxyAgent, fetch as undiciFetch, type Dispatcher } from "undici";
import { auditConfig } from "./config";

/**
 * Network access for the audit engine.
 *
 * The server fetches addresses typed by anonymous visitors, so every request
 * is checked to make sure it goes to the public internet and not to this
 * server's own network (server-side request forgery). The check happens when
 * the connection is opened, on the address the name actually resolved to.
 */

export class BlockedAddressError extends Error {}

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 127],
  ["64:ff9b::", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["2001:db8::", 32],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

/** Local addresses are only allowed in development and tests. */
function allowPrivate(): boolean {
  return process.env.AUDIT_ALLOW_PRIVATE_HOSTS === "1";
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true;
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return blocked.check(mapped[1], "ipv4");
    return blocked.check(address, "ipv6");
  }
  return blocked.check(address, "ipv4");
}

/** Rejects addresses that are obviously not public websites, before any request is made. */
export function assertPublicUrl(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedAddressError("Only http and https addresses can be audited.");
  }
  if (allowPrivate()) return;
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new BlockedAddressError("Websites on custom ports cannot be audited.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(host)) {
    if (isBlockedAddress(host)) throw new BlockedAddressError("That address is not a public website.");
    return;
  }
  if (host === "localhost" || /\.(?:localhost|local|internal|lan|home|corp|test|invalid|example)$/.test(host)) {
    throw new BlockedAddressError("That address is not a public website.");
  }
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** DNS lookup that refuses names resolving to private or local addresses. */
function guardedLookup(hostname: string, options: object, callback: LookupCallback): void {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const list = addresses as LookupAddress[];
    if (!allowPrivate() && list.some((entry) => isBlockedAddress(entry.address))) {
      return callback(new BlockedAddressError("That address is not a public website."), []);
    }
    if ((options as { all?: boolean }).all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

let dispatcher: Dispatcher | null = null;

function getDispatcher(): Dispatcher {
  if (dispatcher) return dispatcher;
  const timeouts = {
    headersTimeout: auditConfig.requestTimeoutMs,
    bodyTimeout: auditConfig.requestTimeoutMs,
    connect: { timeout: auditConfig.requestTimeoutMs },
  };
  if (process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy) {
    // Behind an outbound proxy the proxy resolves names for proxied requests,
    // so it is responsible for blocking internal addresses there. Hosts listed
    // in NO_PROXY connect directly, and those still go through the guarded lookup.
    dispatcher = new EnvHttpProxyAgent({
      ...timeouts,
      connect: { timeout: auditConfig.requestTimeoutMs, lookup: guardedLookup as never },
    });
  } else {
    dispatcher = new Agent({
      ...timeouts,
      connect: { timeout: auditConfig.requestTimeoutMs, lookup: guardedLookup as never },
    });
  }
  return dispatcher;
}

export interface FetchResult {
  url: string;
  status: number;
  headers: Record<string, string>;
  /** Decoded body, present only when `readBody` was requested and the response had one. */
  body: string | null;
  bytes: number;
  ms: number;
  /** Absolute URL from the Location header on a redirect. */
  location: string | null;
  error: string | null;
}

export interface FetchOptions {
  method?: "GET" | "HEAD";
  readBody?: boolean;
  maxBytes?: number;
  timeoutMs?: number;
  accept?: string;
}

/** Fetches one URL without following redirects. Never throws: failures come back with status 0. */
export async function fetchOnce(rawUrl: string, options: FetchOptions = {}): Promise<FetchResult> {
  const started = Date.now();
  const fail = (error: string): FetchResult => ({
    url: rawUrl,
    status: 0,
    headers: {},
    body: null,
    bytes: 0,
    ms: Date.now() - started,
    location: null,
    error,
  });
  let url: URL;
  try {
    url = new URL(rawUrl);
    assertPublicUrl(url);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Invalid address");
  }
  const timeoutMs = options.timeoutMs ?? auditConfig.requestTimeoutMs;
  try {
    const response = await undiciFetch(url, {
      method: options.method ?? "GET",
      redirect: "manual",
      dispatcher: getDispatcher(),
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "user-agent": auditConfig.userAgent,
        accept: options.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en",
      },
    });
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    let location: string | null = null;
    if (response.status >= 300 && response.status < 400 && headers.location) {
      try {
        location = new URL(headers.location, url).href;
      } catch {
        location = null;
      }
    }
    let body: string | null = null;
    let bytes = 0;
    if (options.readBody && response.body && response.status >= 200 && response.status < 300) {
      const limit = options.maxBytes ?? auditConfig.maxHtmlBytes;
      const chunks: Uint8Array[] = [];
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        bytes += value.byteLength;
        if (bytes >= limit) {
          await reader.cancel().catch(() => undefined);
          break;
        }
      }
      body = Buffer.concat(chunks).toString("utf8");
    } else {
      await response.body?.cancel().catch(() => undefined);
    }
    return { url: url.href, status: response.status, headers, body, bytes, ms: Date.now() - started, location, error: null };
  } catch (error) {
    const cause = (error as { cause?: { code?: string; message?: string } })?.cause;
    if (error instanceof BlockedAddressError || cause instanceof BlockedAddressError) {
      return fail("That address is not a public website.");
    }
    const name = (error as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") return fail("The website took too long to respond.");
    const code = cause?.code;
    if (code === "ENOTFOUND" || code === "EAI_AGAIN") return fail("The website address could not be found.");
    if (code === "ECONNREFUSED") return fail("The website refused the connection.");
    if (code && /CERT|SSL|TLS/i.test(code)) return fail("The website has a security certificate problem.");
    return fail("The website could not be reached.");
  }
}

export interface FollowResult {
  /** Every hop, first request first. The last entry is the final response. */
  hops: FetchResult[];
  final: FetchResult;
}

/** Fetches a URL and follows redirects, checking each hop. */
export async function fetchFollow(rawUrl: string, options: FetchOptions = {}, maxHops = 6): Promise<FollowResult> {
  const hops: FetchResult[] = [];
  let current = rawUrl;
  for (let i = 0; i <= maxHops; i += 1) {
    const result = await fetchOnce(current, options);
    hops.push(result);
    if (!result.location) break;
    current = result.location;
  }
  return { hops, final: hops[hops.length - 1] };
}
