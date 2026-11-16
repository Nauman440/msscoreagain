/** A small robots.txt parser that follows Google's matching rules (longest match wins, * and $). */

interface Rule {
  allow: boolean;
  pattern: string;
  regex: RegExp;
}

interface Group {
  agents: string[];
  rules: Rule[];
}

export interface RobotsFile {
  groups: Group[];
  sitemaps: string[];
}

function toRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

export function parseRobots(text: string): RobotsFile {
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (field === "sitemap") {
      if (value) sitemaps.push(value);
    } else if ((field === "allow" || field === "disallow") && current) {
      if (!value) continue; // "Disallow:" with no path allows everything
      current.rules.push({ allow: field === "allow", pattern: value, regex: toRegex(value) });
    }
  }
  return { groups, sitemaps };
}

function groupFor(robots: RobotsFile, agent: string): Group | null {
  const token = agent.toLowerCase();
  const exact = robots.groups.filter((group) => group.agents.some((a) => a !== "*" && token.includes(a)));
  if (exact.length) return { agents: [token], rules: exact.flatMap((group) => group.rules) };
  const wildcard = robots.groups.filter((group) => group.agents.includes("*"));
  if (wildcard.length) return { agents: ["*"], rules: wildcard.flatMap((group) => group.rules) };
  return null;
}

/** True when `agent` may fetch `path` (path plus query string). */
export function isAllowed(robots: RobotsFile, agent: string, path: string): boolean {
  const group = groupFor(robots, agent);
  if (!group) return true;
  let best: Rule | null = null;
  for (const rule of group.rules) {
    if (!rule.regex.test(path)) continue;
    if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

/** True when the agent is shut out of the whole site. */
export function isFullyBlocked(robots: RobotsFile, agent: string): boolean {
  return !isAllowed(robots, agent, "/");
}

/** True when the file has a group written for this agent by name. */
export function hasNamedGroup(robots: RobotsFile, agent: string): boolean {
  const token = agent.toLowerCase();
  return robots.groups.some((group) => group.agents.includes(token));
}
