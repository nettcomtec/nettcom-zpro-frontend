import path from "path";
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
  // Raiz do tracing FIXA no proprio frontend. Sem isso o Next adivinha a raiz do
  // workspace subindo os diretorios atras de lockfile: um package-lock.json solto
  // acima do projeto (ja visto em /home/deployzdg) passa a ser a raiz e a saida
  // standalone nasce em .next/standalone/<caminho-do-projeto>/server.js, enquanto
  // o PM2 sobe .next/standalone/server.js. O build termina com sucesso (e apenas
  // warning) e o frontend nao sobe, mantendo a versao antiga no ar.
  outputFileTracingRoot: path.join(__dirname),
  reactStrictMode: false,
  // Remove o cabecalho "X-Powered-By: Next.js" da resposta. Nao corrige falha
  // alguma — apenas deixa de entregar de graca a tecnologia do servidor para
  // scanners e ferramentas de reconhecimento (CWE-200). Nada no produto le
  // esse cabecalho.
  poweredByHeader: false,
  experimental: {
    cpus: 1,
  },
  async redirects() {
    return [{ source: "/manifest.json", destination: "/manifest.webmanifest", permanent: false }];
  },
  async headers() {
    // Dev local com backend em http://localhost:<porta> (ex.: API_URL fora do túnel):
    // sem esta exceção o connect-src (https:/wss:) bloqueia todo fetch/socket ao
    // backend local. Vazio em produção — o CSP publicado não muda.
    const isDev = process.env.NODE_ENV === "development";
    const devConnect = isDev
      ? " http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:*"
      : "";
    // Mesma razao, para as imagens/midias de branding servidas pelo backend local
    // (/publicFavicon, /publicLogoDark, /publicPwaIcon/...): porta diferente do front,
    // logo fora de 'self', e http, logo fora de https:. Vazio em producao.
    const devHttp = isDev ? " http://localhost:* http://127.0.0.1:*" : "";
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://connect.facebook.net blob:",
      "style-src 'self' 'unsafe-inline' https:",
      `img-src 'self' data: blob: https:${devHttp}`,
      `media-src 'self' blob: https: data:${devHttp}`,
      `connect-src 'self' https: wss:${devConnect}`,
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
