import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  logging: { incomingRequests: false },
};

export default nextConfig;
