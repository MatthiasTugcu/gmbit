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
    const coep = { key: "Cross-Origin-Embedder-Policy", value: "require-corp" };
    const corp = { key: "Cross-Origin-Resource-Policy", value: "same-origin" };
    return [
      {
        source: "/analyze",
        headers: [{ key: "Cross-Origin-Opener-Policy", value: "same-origin" }, coep],
      },
      // Same-origin subresources fetched by the cross-origin-isolated /analyze
      // document must carry CORP, or Safari/WebKit blocks them under COEP:
      // require-corp (Chrome grants same-origin an implicit pass; Safari does
      // not). The Stockfish worker also needs its own COEP so it can be
      // cross-origin-isolated and spawn its search threads.
      { source: "/engine/:path*", headers: [corp, coep] },
      { source: "/sounds/:path*", headers: [corp] },
    ];
  },
};

export default nextConfig;
