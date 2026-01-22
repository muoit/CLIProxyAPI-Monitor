import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker deployment
  output: "standalone",
  // Enable Next.js 16 experimental view transition support
  experimental: {
    viewTransition: true,
  },
  // Expose TIMEZONE to client-side
  env: {
    NEXT_PUBLIC_TIMEZONE: process.env.TIMEZONE || "Asia/Shanghai",
  },
};

export default nextConfig;
