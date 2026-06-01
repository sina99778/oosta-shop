import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produce a self-contained server bundle for Docker.
  output: "standalone",
  // Trace workspace dependencies from the monorepo root so the bundle is complete.
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
