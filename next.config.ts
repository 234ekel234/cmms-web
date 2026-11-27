import type { NextConfig } from "next";
import { execFileSync } from "node:child_process";

/**
 * Which build this is, for Settings → About this app: the commit the build
 * was made from and when. Read from git at build time (the droplet builds in
 * its checkout of main, deploy/deploy.sh); "unknown" where there is no git.
 */
function buildCommit(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "unknown";
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  // The droplet runs the web as a self-contained Node server
  // (.next/standalone/server.js, deploy/deploy.sh). It carries only the
  // node_modules the app actually uses, so a release is a folder that can be
  // copied aside and switched back to without rebuilding.
  output: "standalone",
  env: {
    NEXT_PUBLIC_BUILD_COMMIT: buildCommit(),
    NEXT_PUBLIC_BUILT_AT: new Date().toISOString(),
  },
};

export default nextConfig;
