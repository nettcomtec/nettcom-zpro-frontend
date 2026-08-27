import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // Branding assets are updated dynamically at runtime — never precache them
  exclude: [
    /logo\.png$/,
    /logo_dark\.png$/,
    /favicon\.ico$/,
    /favicon-.*\.png$/,
    /\/icons\//,
    /manifest\.json$/,
    /manifest\.webmanifest$/,
  ],
  additionalPrecacheEntries: [],
});

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  experimental: {
    cpus: 1,
  },
  async redirects() {
    return [{ source: "/manifest.json", destination: "/manifest.webmanifest", permanent: false }];
  },
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net blob:",
      "style-src 'self' 'unsafe-inline' https:",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https: data:",
      "connect-src 'self' https: wss:",
      "worker-src 'self' blob:",
      "font-src 'self' https: data:",
      // Iframes que o APP embute: termos (ajuda.zdg.com.br/GitBook), preview de
      // PDF/email, chat interno RC, webchat, signup Meta, etc. 'none' quebrava todos.
      // 'self' https: cobre esses casos em producao (tudo https); blob:/data: cobrem
      // previews locais. frame-ancestors 'none' (abaixo) segue protegendo o app de
      // ser embutido por terceiros (anti-clickjacking) — isso NAO muda.
      "frame-src 'self' https: blob: data:",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ");
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
        ],
      },
    ];
  },
  transpilePackages: ["@breezystack/lamejs"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default withSerwist(nextConfig);
