import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker's explicit constrained-build path only; ordinary application defaults stay unchanged.
  experimental: process.env.SERRIAN_BUILD_CPUS ? { cpus: Number(process.env.SERRIAN_BUILD_CPUS), memoryBasedWorkersCount: false } : undefined,
  // The bounded Docker launcher runs a separate mandatory full tsc after typegen.
  // Other build paths retain Next's ordinary integrated TypeScript validation.
  typescript: process.env.SERRIAN_BUILD_SEQUENTIAL_CHECKS === "1" ? { ignoreBuildErrors: true } : undefined,
  distDir: process.env.SERRIAN_TEST_NEXT_DIST_DIR?.trim() || undefined,
  agentRules: process.env.SERRIAN_TEST_NEXT_DIST_DIR ? false : undefined,
  turbopack: process.env.SERRIAN_TEST_NEXT_DIST_DIR ? { root: process.cwd() } : undefined,
};

export default nextConfig;
