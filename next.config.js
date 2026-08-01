/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const nextConfig = {
  reactStrictMode: true,
  // Static-exportable SPA: every route prerenders to HTML, all game data is
  // fetched as JSON at runtime (see lib/data.ts).
  output: 'export',
  basePath,
  images: { unoptimized: true },
  trailingSlash: true,
  eslint: { ignoreDuringBuilds: false },
};

module.exports = nextConfig;
