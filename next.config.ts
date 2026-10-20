import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://localhost:8080/api/v1";

const nextConfig: NextConfig = {
  devIndicators: false,
  async redirects() {
    return [
      {
        // One URL for search results (SCRUM-469): /catalog?q=… opens /search?q=…, the query
        // string (q, sort, page) passes through.
        source: "/catalog",
        has: [{ type: "query", key: "q" }],
        destination: "/search",
        permanent: false,
      },
    ];
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
