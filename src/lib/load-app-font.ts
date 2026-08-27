import { findFont, SYSTEM_FONT } from "./google-fonts";

export type FontSource = "cdn" | "selfhost";
export type AvatarShape = "circle" | "rounded-square";

const LINK_ID = "zpro-app-font";

export interface ApplyFontOpts {
  family: string;
  weights: string[];
  source: FontSource;
  selfHostBaseUrl?: string;
}

export function loadAppFont(opts: ApplyFontOpts): void {
  if (typeof document === "undefined") return;

  document.getElementById(LINK_ID)?.remove();

  if (!opts.family || opts.family === "system") {
    document.documentElement.style.setProperty("--font-app", SYSTEM_FONT.cssFamily);
    return;
  }

  const font = findFont(opts.family);
  const cssFamilyName = font?.cssFamily || opts.family;

  const validWeights = opts.weights.filter(w => /^\d+$/.test(w));
  const weights = validWeights.length ? validWeights : ["400", "500", "600", "700"];

  const link = document.createElement("link");
  link.id = LINK_ID;
  link.rel = "stylesheet";

  if (opts.source === "selfhost" && opts.selfHostBaseUrl) {
    const slug = opts.family.replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, "_");
    link.href = `${opts.selfHostBaseUrl}/${slug}/font.css`;
  } else {
    link.href = `https://fonts.googleapis.com/css2?family=${opts.family.replace(/ /g, "+")}:wght@${weights.join(";")}&display=swap`;
  }

  document.head.appendChild(link);
  document.documentElement.style.setProperty(
    "--font-app",
    `"${cssFamilyName}", ui-sans-serif, system-ui, -apple-system, sans-serif`
  );
}

export function applyAvatarShape(shape: AvatarShape): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.avatarShape = shape;
}
