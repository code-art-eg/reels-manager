import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components (partial prerendering) is deliberately left off. Every
  // route here is authenticated and renders per-user data, so there is no static
  // shell worth streaming — and a prerendered shell commits an HTTP 200 before
  // `notFound()` can run, which would make unknown clip references answer 200.
  cacheComponents: false,
};

export default nextConfig;
