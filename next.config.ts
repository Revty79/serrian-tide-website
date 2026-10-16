import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.SERRIAN_TEST_NEXT_DIST_DIR?.trim() || undefined,
  agentRules: process.env.SERRIAN_TEST_NEXT_DIST_DIR ? false : undefined,
  turbopack: process.env.SERRIAN_TEST_NEXT_DIST_DIR ? { root: process.cwd() } : undefined,
};

export default nextConfig;
