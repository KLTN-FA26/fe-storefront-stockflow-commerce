import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://localhost:8080/api/v1";

const nextConfig: NextConfig = {
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
