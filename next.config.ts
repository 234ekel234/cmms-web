import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The droplet runs the web as a self-contained Node server
  // (.next/standalone/server.js, deploy/deploy.sh). It carries only the
  // node_modules the app actually uses, so a release is a folder that can be
  // copied aside and switched back to without rebuilding.
  output: "standalone",
};

export default nextConfig;
