import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Everything under public/models and public/hdri is a large, mostly-
  // static binary asset (the 1.3MB Draco-compressed apartment.glb, the 4K
  // HDRIs) fetched by every visitor to "/" (the hero) and "/project" alike
  // — see docs/ASSETS.md for what each one is. Next only auto-assigns
  // long-lived cache headers to its own hashed /_next/static/* build
  // output; anything placed under public/ gets the framework's default
  // (Cache-Control: public, max-age=0 — revalidate on every single
  // request), confirmed by checking the actual response headers, not
  // assumed. That default is measurably worse than it needs to be for
  // assets this size and this static — see docs/PERFORMANCE.md.
  //
  // max-age=86400 (one day), not a full year/immutable: these filenames
  // aren't content-hashed (docs/ASSETS.md's optimisation pipeline writes
  // a fixed "apartment.glb" every time, not a hash-suffixed one), so an
  // aggressively long, non-revalidating cache would risk a returning
  // visitor being stuck on a stale model for months if it's ever
  // re-exported before final submission. A day is long enough to remove
  // the cost from every repeat visit within a session or a day of
  // testing, short enough that a same-day asset swap is still seen
  // within a day rather than requiring every visitor to hard-refresh.
  async headers() {
    return [
      {
        source: "/models/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
      },
      {
        source: "/hdri/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
      },
    ];
  },
};

export default nextConfig;
