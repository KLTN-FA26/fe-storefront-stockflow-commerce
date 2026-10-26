import type { NextConfig } from "next";

import { STOREFRONT_REDIRECTS } from "./src/constants/redirects";

const API_URL = process.env.API_URL ?? "http://localhost:8080/api/v1";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Inlined into the client bundle so the address hook can call the provinces API from the browser.
  env: {
    VIETNAM_PROVINCES_API_URL: process.env.VIETNAM_PROVINCES_API_URL ?? "",
  },
  async redirects() {
    return STOREFRONT_REDIRECTS;
  },
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
