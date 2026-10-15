import type { NextConfig } from "next";

// Where the two backends live. Set these in production; localhost is the development default.
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5500';
const BACKEND2_URL = process.env.BACKEND2_URL || 'http://localhost:8000';

const nextConfig: NextConfig = {
  turbopack: {
    root: import.meta.dirname,
  },
  reactStrictMode: true,
  experimental: {
    // Requests proxied to the backends are cut off after 30 seconds by default.
    // Transcribing a video without captions and building a roadmap both take longer.
    proxyTimeout: 10 * 60 * 1000,
  },
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  typescript: {
    // Pre-existing TS errors in company pages (custom component prop mismatches)
    // TODO: Fix these and remove this flag
    ignoreBuildErrors: true,
  },
  async rewrites() {
    return [
      {
        source: '/api2/:path*',
        destination: `${BACKEND2_URL}/:path*` // Proxy to backend2 (FastAPI)
      },
      {
        source: '/api/:path*',
        destination: `${BACKEND_URL}/api/:path*` // Proxy to backend
      }
    ];
  }
};

export default nextConfig;
