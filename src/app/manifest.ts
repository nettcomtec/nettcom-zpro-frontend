import type { MetadataRoute } from "next";
import { readBrandingServer } from "@/lib/branding-server";

export const dynamic = "force-dynamic";

/**
 * Manifest servido em /manifest.webmanifest.
 * Ícones apontam para a API (publicPwaIcon), igual ao preview em /customizar — evita cópia stale
 * do build standalone em public/icons (favicon já usa API via script no layout).
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { appName, pwaIconTimestamp } = await readBrandingServer();
  const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3101").replace(/\/$/, "");
  const t = pwaIconTimestamp > 0 ? pwaIconTimestamp : "";
  const qs = t !== "" ? `?t=${t}` : "";
  const src = (size: number) =>
    `${apiBase}/publicPwaIcon/icon-${size}x${size}.png${qs}`;
  const icon = (size: number, purpose: "any" | "maskable" | "monochrome") => ({
    src: src(size),
    sizes: `${size}x${size}`,
    type: "image/png" as const,
    purpose,
  });

  const shortName = appName.length > 12 ? appName.slice(0, 12) : appName;

  return {
    name: appName,
    short_name: shortName,
    description: "Sistema de atendimento multicanal",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#6366f1",
    start_url: "/",
    scope: "/",
    icons: [
      icon(128, "any"),
      icon(192, "any"),
      icon(192, "maskable"),
      icon(256, "any"),
      icon(384, "any"),
      icon(512, "any"),
      icon(512, "maskable"),
      icon(1024, "any"),
    ],
  };
}
