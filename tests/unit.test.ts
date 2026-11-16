import { describe, expect, it } from "vitest";
import { isBlockedAddress } from "../src/lib/audit/net";
import { hasNamedGroup, isAllowed, isFullyBlocked, parseRobots } from "../src/lib/audit/robots";
import { categoryScores, overallScore, ratioScore, type Check } from "../src/lib/audit/scoring";
import { InvalidUrlError, normalizeLink, parseInputUrl, sameUrl } from "../src/lib/audit/url";

describe("parseInputUrl", () => {
  it("adds https to a bare domain", () => {
    expect(parseInputUrl("example.com").href).toBe("https://example.com/");
  });
  it("keeps the path and drops the fragment", () => {
    expect(parseInputUrl("http://www.example.com/services#top").href).toBe("http://www.example.com/services");
  });
  it("rejects things that are not websites", () => {
    expect(() => parseInputUrl("")).toThrow(InvalidUrlError);
    expect(() => parseInputUrl("hello")).toThrow(InvalidUrlError);
    expect(() => parseInputUrl("ftp://example.com")).toThrow(InvalidUrlError);
    expect(() => parseInputUrl("https://user:pass@example.com")).toThrow(InvalidUrlError);
  });
});

describe("normalizeLink", () => {
  const base = "https://www.example.com/services/";
  it("resolves relative links and strips fragments and tracking", () => {
    expect(normalizeLink("../about?utm_source=x#team", base, "www.example.com")).toBe("https://www.example.com/about");
  });
  it("treats www and the bare domain as the same site", () => {
    expect(normalizeLink("https://example.com/contact", base, "www.example.com")).toBe("https://example.com/contact");
  });
  it("skips other sites, files and non-web links", () => {
    expect(normalizeLink("https://other.com/", base, "www.example.com")).toBeNull();
    expect(normalizeLink("/brochure.pdf", base, "www.example.com")).toBeNull();
    expect(normalizeLink("mailto:hi@example.com", base, "www.example.com")).toBeNull();
    expect(normalizeLink("tel:+15551234", base, "www.example.com")).toBeNull();
    expect(normalizeLink("#section", base, "www.example.com")).toBeNull();
  });
  it("compares URLs ignoring a trailing slash, scheme and www", () => {
    expect(sameUrl("https://www.example.com/a/", "http://example.com/a")).toBe(true);
    expect(sameUrl("https://example.com/a", "https://example.com/b")).toBe(false);
  });
});

describe("robots.txt", () => {
  const robots = parseRobots(
    [
      "User-agent: *",
      "Disallow: /wp-admin/",
      "Allow: /wp-admin/admin-ajax.php",
      "Disallow: /*.pdf$",
      "",
      "User-agent: GPTBot",
      "Disallow: /",
      "",
      "Sitemap: https://example.com/sitemap.xml",
    ].join("\n"),
  );
  it("applies the longest matching rule", () => {
    expect(isAllowed(robots, "googlebot", "/wp-admin/options.php")).toBe(false);
    expect(isAllowed(robots, "googlebot", "/wp-admin/admin-ajax.php")).toBe(true);
    expect(isAllowed(robots, "googlebot", "/services/")).toBe(true);
  });
  it("supports * and $ patterns", () => {
    expect(isAllowed(robots, "googlebot", "/files/guide.pdf")).toBe(false);
    expect(isAllowed(robots, "googlebot", "/files/guide.pdf?v=2")).toBe(true);
  });
  it("uses a named group over the wildcard group", () => {
    expect(isFullyBlocked(robots, "GPTBot")).toBe(true);
    expect(hasNamedGroup(robots, "GPTBot")).toBe(true);
    expect(isFullyBlocked(robots, "ClaudeBot")).toBe(false);
  });
  it("reads sitemap lines", () => {
    expect(robots.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
  });
  it("treats an empty Disallow as allow everything", () => {
    expect(isAllowed(parseRobots("User-agent: *\nDisallow:"), "googlebot", "/anything")).toBe(true);
  });
});

describe("address checks", () => {
  it("blocks private, local and metadata addresses", () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "172.16.0.5", "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "::ffff:127.0.0.1"]) {
      expect(isBlockedAddress(address), address).toBe(true);
    }
  });
  it("allows public addresses", () => {
    for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) {
      expect(isBlockedAddress(address), address).toBe(false);
    }
  });
});

describe("scoring", () => {
  it("costs nothing when nothing is affected and scales with spread", () => {
    expect(ratioScore(0, 50)).toBe(1);
    expect(ratioScore(1, 50)).toBeLessThan(0.6);
    expect(ratioScore(1, 50)).toBeGreaterThan(ratioScore(10, 50));
    expect(ratioScore(20, 50)).toBe(0);
  });
  it("leaves unmeasured categories out of the overall score", () => {
    const checks: Check[] = [
      { id: "a", category: "technical", severity: "high", weight: 1, score: 1 },
      { id: "b", category: "onpage", severity: "high", weight: 1, score: 0.5 },
    ];
    const categories = categoryScores(checks);
    expect(categories.technical).toBe(100);
    expect(categories.onpage).toBe(50);
    expect(categories.speed).toBeNull();
    expect(overallScore(categories)).toBe(Math.round((100 * 0.3 + 50 * 0.25) / 0.55));
  });
});
