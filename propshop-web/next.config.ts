import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.STANDALONE === "1" ? "standalone" : undefined,
  // The response cache in src/proxy.ts must see Next's navigation headers (rsc,
  // next-router-*) and the `_rsc` param; by default the proxy gets them stripped, and an
  // in-app navigation would be indistinguishable from a page load.
  skipProxyUrlNormalize: true,
  experimental: {
    // With a proxy, Next buffers each request body and CUTS IT OFF at 10 MB by default —
    // which silently truncated photo (15 MB), ownership-document (25 MB) and tour-video
    // (200 MB) uploads. Must stay above the largest upload rule in src/lib/storage.ts.
    proxyClientMaxBodySize: "210mb",
  },
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  // The Flutter web build is copied into public/app (see public/app — a build artefact)
  // so the app is served from the site's own origin: one link for testers, and the app's
  // API calls are same-origin, so no CORS is needed in production.
  async rewrites() {
    return [
      { source: "/app", destination: "/app/index.html" },
      { source: "/app/", destination: "/app/index.html" },
    ];
  },
};

export default nextConfig;
