import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.SERRIAN_TEST_NEXT_DIST_DIR?.trim() || undefined,
  agentRules: process.env.SERRIAN_TEST_NEXT_DIST_DIR ? false : undefined,
};

export default nextConfig;
