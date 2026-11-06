/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  experimental: {
    // Keep a visited page in the browser's router cache for 30s, so going back to it
    // doesn't wait on the server. Every write (a server action that revalidates) and the
    // refresh on returning to the tab clear this cache, so it never shows a page older
    // than your own edits.
    staleTimes: { dynamic: 30 },
    // Lets <Link unstable_dynamicOnHover> (the sidebar) fetch a whole page on hover
    // instead of only its loading.tsx. Without this flag the prop is ignored.
    dynamicOnHover: true,
  },
  async redirects() {
    return [
      // Links saved while the app lived under /notes (page links inside page bodies,
      // bookmarks) keep working.
      { source: "/notes", destination: "/", permanent: true },
      { source: "/notes/:path*", destination: "/:path*", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Private by design: keep every page out of search engines.
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
