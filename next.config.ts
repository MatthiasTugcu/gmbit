import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  experimental: {
    turbopackFileSystemCacheForDev: true,
  },
  // Cross-origin isolation, scoped to /analyze only. SharedArrayBuffer (needed
  // by the multi-threaded Stockfish build) requires the document to be
  // crossOriginIsolated, which needs both COOP: same-origin and COEP. We scope
  // it to /analyze so the landing page's external news/avatar images (loaded
  // no-cors) keep working — /analyze itself loads no cross-origin subresources.
  async headers() {
    return [
      {
        source: "/analyze",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
