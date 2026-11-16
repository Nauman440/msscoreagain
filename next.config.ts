import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The audit engine runs in the Node.js server process; keep these packages
  // out of the bundle so their native networking code is used as published.
  serverExternalPackages: ["undici", "pg", "cheerio"],
};

export default nextConfig;
