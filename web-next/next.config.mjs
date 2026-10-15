const stagingNoIndex = process.env.STAGING_NO_INDEX === "true";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root to this app. Without it, Turbopack infers the
  // monorepo root from the parent lockfile and nests the standalone output
  // under web-next/, breaking the Dockerfile's `node server.js` layout.
  turbopack: {
    root: new URL(".", import.meta.url).pathname,
  },
  // Standalone output keeps the Railway Docker image small (only the traced
  // server + minimal node_modules are copied).
  output: "standalone",
  poweredByHeader: false,
  // Article/category images come from Cloudflare Images + sabq.org CDN. We use
  // plain <img> with explicit width/height (no next/image optimizer) so the
  // LCP element is discoverable in the initial HTML without an extra hop.
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        // Public content is cacheable at the Cloudflare edge. Matches the SPA
        // policy in client/public/_headers and functions/_middleware.js.
        source: "/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: stagingNoIndex
              ? "private, no-store"
              : "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
          },
          ...(stagingNoIndex
            ? [
                {
                  key: "X-Robots-Tag",
                  value: "noindex, nofollow, noarchive",
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
