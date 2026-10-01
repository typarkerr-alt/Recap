import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.gutenberg.org" },
      { protocol: "https", hostname: "covers.openlibrary.org" },
      { protocol: "https", hostname: "standardebooks.org" },
      { protocol: "http", hostname: "www.gutenberg.org" },
    ],
  },
};

export default nextConfig;
