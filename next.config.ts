import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ["192.168.2.15:3000", "192.168.2.15", "localhost:3000", "localhost"]
};

export default nextConfig;
