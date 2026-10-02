import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.gutenberg.org" },
      { protocol: "http", hostname: "www.gutenberg.org" },
      { protocol: "https", hostname: "covers.openlibrary.org" },
      { protocol: "https", hostname: "archive.org" },
      { protocol: "https", hostname: "*.archive.org" },
      { protocol: "https", hostname: "tile.loc.gov" },
      { protocol: "https", hostname: "cdn.loc.gov" },
      { protocol: "https", hostname: "www.loc.gov" },
    ],
  },
};

export default nextConfig;
