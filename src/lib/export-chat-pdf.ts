import jsPDF from "jspdf";
import type { Ticket } from "@/stores/ticket-store";
import { displayContactIdentity } from "@/lib/contact-identity";

// ─── sanitize ─────────────────────────────────────────────────────────────────
function sanitizeForPdf(text: string): string {
  const emojiMap: Record<string, string> = {
    "🖼": "[Imagem]", "🎵": "[Audio]", "🎬": "[Video]", "🎨": "[Sticker]",
    "📄": "[Documento]", "👤": "[Contato]", "📍": "[Localizacao]",
    "📎": "[Midia]", "📝": "[Nota interna]", "⏳": "[Aguardando]",
  };
  let s = text;
  for (const [emoji, label] of Object.entries(emojiMap)) s = s.replaceAll(emoji, label);
  s = s.replace(/[\u{1F000}-\u{1FFFF}]/gu, "");
  s = s.replace(/[\u{2600}-\u{27BF}]/gu, "");
  s = s.replace(/[\u{1F900}-\u{1F9FF}]/gu, "");
  s = s.normalize("NFC");
  s = s.replace(/[^\x00-\xFF]/g, "?");
  return s;
}

// ─── theme color ──────────────────────────────────────────────────────────────
function hslPartsToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else              { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** Reads the brand color from CSS variables set by applyBrandColors(). */
function getBrandRgb(): [number, number, number] {
  const FALLBACK: [number, number, number] = [124, 58, 237]; // violet-600
  if (typeof window === "undefined") return FALLBACK;
  try {
    const style = getComputedStyle(document.documentElement);
    const qHex = style.getPropertyValue("--q-primary").trim();
    if (qHex.startsWith("#") && qHex.length === 7) {
      const r = parseInt(qHex.slice(1, 3), 16);
      const g = parseInt(qHex.slice(3, 5), 16);
      const b = parseInt(qHex.slice(5, 7), 16);
      if (!isNaN(r)) return [r, g, b];
    }
    const hslStr = style.getPropertyValue("--primary").trim();
    const parts = hslStr.split(/\s+/);
    if (parts.length >= 3) {
      const h = parseFloat(parts[0]);
      const s = parseFloat(parts[1]) / 100;
      const l = parseFloat(parts[2]) / 100;
      if (!isNaN(h) && s > 0.25 && l > 0.15 && l < 0.85) return hslPartsToRgb(h, s, l);
    }
  } catch { /* ignore */ }
  return FALLBACK;
}

function lighten(rgb: [number, number, number], f: number): [number, number, number] {
  return [
    Math.min(255, Math.round(rgb[0] + (255 - rgb[0]) * f)),
    Math.min(255, Math.round(rgb[1] + (255 - rgb[1]) * f)),
    Math.min(255, Math.round(rgb[2] + (255 - rgb[2]) * f)),
  ];
}

// ─── media helpers ────────────────────────────────────────────────────────────
interface LogoData { dataUrl: string; format: string; w: number; h: number }

function resolveMediaUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("blob:")) return url;
  // Espelha getMediaUrl() do message-bubble: base relativa ("") quando a env
  // não está setada — assim o PDF resolve a mídia igual ao chat (same-origin),
  // em vez de cair em http://localhost:3101 e quebrar em produção.
  const base = process.env.NEXT_PUBLIC_API_URL || "";
  return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
}

async function fetchImageAsDataUrl(
  url: string,
  maxPx = 900,
  timeoutMs = 8000,
): Promise<LogoData | null> {
  if (!url) return null;
  // .was = WhatsApp Animated Sticker (Lottie/JSON), .tgs = Telegram Sticker (gzip JSON).
  // These are animation formats, not static images — no browser can render them via <img>.
  // Return null immediately so callers show the appropriate placeholder.
  if (/\.(was|tgs)($|\?|#)/i.test(url)) return null;
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      // Same-origin endpoints (ZPro backend) may require session cookies.
      // Cross-origin CDNs (e.g. pps.whatsapp.net) return ACAO:* which is
      // incompatible with credentials:include — they must use omit.
      const isSameOrigin = (() => {
        try { return new URL(url).origin === window.location.origin; }
        catch { return false; }
      })();
      res = await fetch(url, {
        signal: ctrl.signal,
        credentials: isSameOrigin ? "include" : "omit",
      });
    } finally {
      clearTimeout(tid);
    }
    if (!res.ok) {
      console.warn(`[PDF export] fetch failed ${res.status} — ${url}`);
      return null;
    }
    const blob = await res.blob();
    // Accept image/* and application/octet-stream — some backends return a
    // generic content-type for WebP stickers and other binary media files.
    const mimeIsImage   = blob.type.startsWith("image/");
    const mimeIsGeneric = blob.type === "application/octet-stream" || blob.type === "";
    if (!mimeIsImage && !mimeIsGeneric) {
      console.warn(`[PDF export] rejected MIME "${blob.type}" — ${url}`);
      return null;
    }
    const fmt = blob.type.includes("png") ? "PNG" : blob.type.includes("webp") ? "WEBP" : "JPEG";

    // Read blob → dataUrl
    let rawDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    // For octet-stream / empty-type blobs the data URL has the prefix
    // "data:application/octet-stream;base64,..." — browsers REFUSE to load
    // that as an <img> element (img.onerror fires) which causes the outer
    // catch to return null, producing the [ MIDIA ] placeholder or the
    // sticker fallback. Fix: sniff the actual image format from the first 12
    // magic bytes and replace the data-URL prefix before any image loads.
    if (mimeIsGeneric) {
      const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
      let sniffed = "";
      if (head[0] === 0xFF && head[1] === 0xD8 && head[2] === 0xFF) {
        sniffed = "image/jpeg";
      } else if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4E && head[3] === 0x47) {
        sniffed = "image/png";
      } else if (head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50) {
        sniffed = "image/webp";
      }
      if (sniffed) {
        const comma = rawDataUrl.indexOf(",");
        if (comma !== -1) rawDataUrl = `data:${sniffed};base64,${rawDataUrl.slice(comma + 1)}`;
      }
    }

    // Get natural dimensions
    const { nw, nh } = await new Promise<{ nw: number; nh: number }>((resolve, reject) => {
      const img = new Image();
      img.onload  = () => resolve({ nw: img.naturalWidth, nh: img.naturalHeight });
      img.onerror = reject;
      img.src = rawDataUrl;
    });
    if (nw === 0 || nh === 0) return null;

    // jsPDF supports PNG and JPEG reliably; WEBP is not supported and has no alpha
    // in most renderers. Always convert WEBP → PNG to preserve transparency
    // (critical for stickers). Also scale down if too large.
    // For octet-stream, infer WebP from URL extension or sniffed data-URL type;
    // treat as alpha-needing and always go through canvas.
    const isWebp      = blob.type.includes("webp") || /\.webp($|\?|#)/i.test(url)
                        || rawDataUrl.startsWith("data:image/webp");
    const needsAlpha  = isWebp || blob.type.includes("png") || mimeIsGeneric;
    const needsCanvas = isWebp || mimeIsGeneric || nw > maxPx || nh > maxPx;

    if (!needsCanvas) {
      return { dataUrl: rawDataUrl, format: fmt, w: nw, h: nh };
    }

    const scale = (nw > maxPx || nh > maxPx) ? maxPx / Math.max(nw, nh) : 1;
    const cw = Math.round(nw * scale);
    const ch = Math.round(nh * scale);
    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d");
    const outMime = needsAlpha ? "image/png" : "image/jpeg";
    const outFmt  = needsAlpha ? "PNG" : "JPEG";
    if (!ctx) return { dataUrl: rawDataUrl, format: outFmt, w: nw, h: nh };

    // Load the data URL into an img element (always needed for fallback paths).
    const imgEl = new Image();
    await new Promise<void>((resolve, reject) => {
      imgEl.onload  = () => resolve();
      imgEl.onerror = reject;
      imgEl.src = rawDataUrl;
    });

    // ── Animated WebP / octet-stream: best-frame extraction ─────────────────────
    // For animated WebP stickers we CANNOT just draw frame 0 — it is often fully
    // transparent or a partial delta frame. We must decode and accumulate all frames
    // to obtain a properly composited image.
    // IMPORTANT: this path runs UNCONDITIONALLY for isWebp/mimeIsGeneric, not only
    // when frame 0 is transparent. If we only entered here when hasVisible()==false,
    // a sticker whose frame 0 has one barely-visible pixel (alpha>15) would skip
    // ImageDecoder entirely and return a nearly-transparent PNG.
    if (needsAlpha && (isWebp || mimeIsGeneric)) {
      let found = false;

      // Primary: ImageDecoder API (Chromium 94+) — decodes arbitrary frames by
      // index directly from the blob, no DOM or timing dependency.
      const IDctor = (typeof window !== "undefined"
        ? (window as unknown as Record<string, unknown>).ImageDecoder
        : undefined) as
        | (new (init: { data: unknown; type: string }) => {
            tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } };
            decode(o: { frameIndex: number }): Promise<{ image: ImageBitmap }>;
          })
        | undefined;

      if (IDctor) {
        try {
          // arrayBuffer() is safe here — FileReader above consumed a separate read
          // path and does not lock the blob; Blob objects are immutable data sources.
          const arrayBuffer = await blob.arrayBuffer();
          // Use the sniffed MIME type (from the corrected rawDataUrl prefix) so
          // ImageDecoder can handle JPEG/PNG octet-stream blobs correctly instead
          // of failing trying to decode them as WebP.
          const decodeMime = rawDataUrl.match(/^data:([^;]+)/)?.[1] ?? "image/webp";
          const dec = new IDctor({ data: arrayBuffer, type: decodeMime });
          await dec.tracks.ready;
          const total = dec.tracks.selectedTrack.frameCount;

          // Clear canvas ONCE, then ACCUMULATE all frames without clearing between
          // them. Animated WebP stickers frequently use partial/delta frames — each
          // frame only contains the changed region. Clearing before every draw would
          // leave most of the canvas transparent. Accumulating simulates a real
          // compositor so opaque regions build up across frames.
          ctx.clearRect(0, 0, cw, ch);
          let lastDecoded = false;
          for (let fi = 0; fi < Math.min(total, 30); fi++) {
            try {
              const { image } = await dec.decode({ frameIndex: fi });
              ctx.drawImage(image, 0, 0, cw, ch); // accumulate — no clear
              image.close();
              lastDecoded = true;
            } catch { break; } // out-of-bounds or decode error — stop loop
          }
          if (lastDecoded) found = true;
        } catch { /* ImageDecoder unavailable or failed — fall through to DOM */ }
      }

      // Fallback (Firefox/Safari or ImageDecoder failure): attach img off-screen at
      // full opacity and poll the canvas while the browser plays the animation.
      // translateZ(0) forces a GPU compositing layer so animation advances even
      // when the element is translated off-screen.
      if (!found) {
        imgEl.style.cssText =
          `position:fixed;left:0;top:0;width:${cw}px;height:${ch}px;` +
          `opacity:1;pointer-events:none;transform:translate(-${cw + 20}px,0) translateZ(0);`;
        document.body.appendChild(imgEl);
        try {
          const hasVisible = (): boolean => {
            const d    = ctx.getImageData(0, 0, cw, ch).data;
            const step = Math.max(4, Math.floor(d.length / 400)) * 4;
            for (let i = 3; i < d.length; i += step) if (d[i] > 15) return true;
            return false;
          };
          for (let fi = 0; fi < 12; fi++) {
            await new Promise<void>((r) => setTimeout(r, 250));
            ctx.clearRect(0, 0, cw, ch);
            ctx.drawImage(imgEl, 0, 0, cw, ch);
            if (hasVisible()) { found = true; break; }
          }
          // Last resort: take whatever is on the canvas even if no poll passed
          // hasVisible() — a semi-transparent frame beats a fallback placeholder.
          if (!found) {
            ctx.clearRect(0, 0, cw, ch);
            ctx.drawImage(imgEl, 0, 0, cw, ch);
            found = true;
          }
        } finally {
          document.body.removeChild(imgEl);
        }
      }

      if (!found) return null;

      const scaledDataUrl = canvas.toDataURL(outMime);
      return { dataUrl: scaledDataUrl, format: outFmt, w: cw, h: ch };
    }

    // ── Static images (JPEG, PNG, non-animated) ──────────────────────────────────
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(imgEl, 0, 0, cw, ch);

    if (needsAlpha) {
      // For static PNG: if fully transparent, return null so caller can show a
      // placeholder instead of an invisible image.
      const d    = ctx.getImageData(0, 0, cw, ch).data;
      const step = Math.max(4, Math.floor(d.length / 400)) * 4;
      let hasAny = false;
      for (let i = 3; i < d.length; i += step) { if (d[i] > 15) { hasAny = true; break; } }
      if (!hasAny) return null;
    }

    const scaledDataUrl = canvas.toDataURL(outMime, needsAlpha ? undefined : 0.88);
    return { dataUrl: scaledDataUrl, format: outFmt, w: cw, h: ch };
  } catch (err) {
    console.warn(`[PDF export] exception — ${url}`, err);
    return null;
  }
}

/** Draws a placeholder for stickers that can't be embedded (animated/Lottie). */
function drawStickerFallback(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  color: [number, number, number],
  fontName: string,
): void {
  const bg = lighten(color, 0.9);
  doc.setFillColor(...bg);
  doc.roundedRect(x, y, w, h, 3, 3, "F");
  doc.setDrawColor(...color);
  doc.setLineWidth(0.35);
  doc.setLineDashPattern([1.5, 1.5], 0);
  doc.roundedRect(x, y, w, h, 3, 3, "S");
  doc.setLineDashPattern([], 0);

  // Simple star-like shape: center + 4 satellite dots
  const cx = x + w / 2;
  const cy = y + h / 2 - 3;
  const r = Math.min(w, h) * 0.055;
  doc.setFillColor(...color);
  doc.circle(cx, cy, r * 1.5, "F");
  doc.circle(cx, cy - r * 3.5, r, "F");
  doc.circle(cx + r * 3.5, cy, r, "F");
  doc.circle(cx, cy + r * 3.5, r, "F");
  doc.circle(cx - r * 3.5, cy, r, "F");

  doc.setFontSize(5.5);
  doc.setFont(fontName, "normal");
  doc.setTextColor(...color);
  doc.text("Figurinha animada", cx, y + h - 2.5, { align: "center" });
}

/** Draws a placeholder for media that couldn't be fetched (expired or unavailable on server). */
function drawMediaUnavailable(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  fontName: string,
): void {
  const BG:     [number, number, number] = [245, 245, 247];
  const BORDER: [number, number, number] = [200, 205, 215];
  const ICON:   [number, number, number] = [155, 160, 175];
  doc.setFillColor(...BG);
  doc.roundedRect(x, y, w, h, 3, 3, "F");
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.25);
  doc.setLineDashPattern([1.5, 1.5], 0);
  doc.roundedRect(x, y, w, h, 3, 3, "S");
  doc.setLineDashPattern([], 0);

  // Broken-image icon: outer frame + landscape lines + corner dot
  const cx = x + w / 2;
  const cy = y + h / 2 - 3.5;
  const iW = 11, iH = 9;
  const ix = cx - iW / 2, iy = cy - iH / 2;
  doc.setDrawColor(...ICON);
  doc.setLineWidth(0.4);
  doc.rect(ix, iy, iW, iH);
  // Zigzag representing broken image content
  doc.line(ix, iy + iH * 0.65, ix + iW * 0.4, iy + iH * 0.25);
  doc.line(ix + iW * 0.4, iy + iH * 0.25, ix + iW, iy + iH);
  // Small sun dot (top-left)
  doc.circle(ix + 2.8, iy + 2.5, 1.2, "S");

  doc.setFontSize(5.5);
  doc.setFont(fontName, "normal");
  doc.setTextColor(...ICON);
  doc.text("Midia nao disponivel", cx, y + h - 2.5, { align: "center" });
}

/** Draws a visual audio waveform: play-button circle + bar pattern. */
function drawAudioWaveform(
  doc: jsPDF,
  x: number,
  cy: number,
  w: number,
  maxBarH: number,
  color: [number, number, number],
): void {
  // Play button
  const btnR = maxBarH * 0.9;
  doc.setFillColor(...color);
  doc.circle(x + btnR, cy, btnR, "F");
  doc.setFillColor(255, 255, 255);
  // Triangle pointing right inside circle
  const tx = x + btnR - btnR * 0.25;
  const th = btnR * 0.65;
  doc.triangle(tx, cy - th / 2, tx, cy + th / 2, tx + th * 0.85, cy, "F");

  // Waveform bars
  const PATTERN = [0.3, 0.5, 0.75, 1.0, 0.85, 0.6, 0.9, 1.0, 0.7, 0.4, 0.8, 0.95, 0.6, 0.45, 0.3];
  const barAreaX = x + btnR * 2 + 3;
  const barAreaW = w - (btnR * 2 + 5);
  const barW = Math.max(1.2, barAreaW / (PATTERN.length * 1.6));
  const gap  = barAreaW / PATTERN.length;
  doc.setFillColor(...color);
  PATTERN.forEach((ratio, i) => {
    const bh  = Math.max(1, maxBarH * ratio);
    const bx2 = barAreaX + i * gap;
    const by2 = cy - bh / 2;
    doc.roundedRect(bx2, by2, barW, bh, barW / 4, barW / 4, "F");
  });
}

/**
 * Crops a data URL image to a circle by drawing it on a canvas with arc+clip.
 * Returns a PNG data URL with transparent corners — jsPDF renders it as a circle.
 */
async function circleClipImage(dataUrl: string, sizePx: number): Promise<string | null> {
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = sizePx;
    canvas.height = sizePx;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload  = () => resolve();
      img.onerror = reject;
      img.src = dataUrl;
    });
    ctx.beginPath();
    ctx.arc(sizePx / 2, sizePx / 2, sizePx / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, 0, 0, sizePx, sizePx);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

async function getLogoDataUrl(): Promise<LogoData | null> {
  if (typeof window === "undefined") return null;
  try {
    const stored  = localStorage.getItem("zpro-branding");
    const brand   = stored ? (JSON.parse(stored) as Record<string, unknown>) : null;
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3101";

    // Try dark logo first (header band is brand-colored / dark)
    const darkTs = (brand?.logoDarkTimestamp ?? brand?.customLogoDarkTimestamp) as number | undefined;
    const darkUrl = darkTs ? `${apiBase}/publicLogoDark?t=${darkTs}` : `${apiBase}/publicLogoDark`;
    const dark = await fetchImageAsDataUrl(darkUrl, 400, 5000);
    if (dark) return dark;

    // Fall back to light logo
    const ts = (brand?.logoTimestamp ?? brand?.customLogoTimestamp) as number | undefined;
    const lightUrl = ts ? `${apiBase}/publicLogo?t=${ts}` : `${apiBase}/publicLogo`;
    return fetchImageAsDataUrl(lightUrl, 400, 5000);
  } catch {
    return null;
  }
}

// ─── font name ───────────────────────────────────────────────────────────────
// jsPDF requires uncompressed TTF binary. Browsers always receive woff2 (Brotli-
// compressed) from CDN / next/font — parsing woff2 causes "No unicode cmap" +
// widths crash. Helvetica is the cleanest built-in sans-serif available in jsPDF.
const PDF_FONT = "helvetica";

// ─── auth helper ──────────────────────────────────────────────────────────────
/** Reads the logged-in username from localStorage (written by auth store). */
function getExportingUser(): string {
  if (typeof window === "undefined") return "Sistema";
  try {
    const raw = localStorage.getItem("usuario");
    if (raw) {
      const u = JSON.parse(raw) as Record<string, unknown>;
      if (u.username) return String(u.username);
    }
    return localStorage.getItem("username") ?? "Sistema";
  } catch {
    return "Sistema";
  }
}

// ─── page constants ───────────────────────────────────────────────────────────
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM_MARGIN = 17;
const LINE_H = 4.6;
const BUBBLE_MAX = Math.round(CONTENT_W * 0.72);

// ─── static palette ───────────────────────────────────────────────────────────
const THEM_BG:      [number, number, number] = [255, 255, 255];
const THEM_TEXT:    [number, number, number] = [26,  32,  44 ];
const NOTE_BG:      [number, number, number] = [255, 249, 219];
const NOTE_TEXT:    [number, number, number] = [120, 53,  15 ];
// Aviso de disparo de mensagem agendada — linha de sistema, nao e nota do
// atendente: verde para separar visualmente da caixa amarela de nota.
const SCHED_BG:     [number, number, number] = [236, 253, 245];
const SCHED_TEXT:   [number, number, number] = [6,   95,  70 ];
const GRAY_MUTED:   [number, number, number] = [107, 114, 128];
const GRAY_BORDER:  [number, number, number] = [218, 220, 224];
const CHAT_BG:      [number, number, number] = [236, 239, 241];
const TS_THEM:      [number, number, number] = [140, 150, 165];
const DELETED_BG:   [number, number, number] = [242, 242, 242];
const DELETED_TEXT: [number, number, number] = [160, 165, 170];

// ─── types ────────────────────────────────────────────────────────────────────
export interface ExportMessage {
  id: string;
  // ID do canal/provedor (distinto do id do banco). Usado só para reconhecer o
  // aviso de disparo de agendada, cujo prefixo é "sched_notice".
  messageId?: string;
  body: string;
  fromMe: boolean;
  mediaType?: string;
  mediaUrl?: string;
  // S3/R2 público — preferido sobre mediaUrl (keepLocalCopy=false faz o
  // mediaUrl local retornar 404). Espelha getMediaUrl() do chat.
  storageUrl?: string;
  fileName?: string;
  createdAt: string;
  isDeleted?: boolean;
  isEdited?: boolean;
  ack?: number;
  contact?: { name?: string; number?: string };
  user?: { id: number; name: string };
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function initials(name: string): string {
  return name.split(" ").slice(0, 2).map((n) => n[0] ?? "").join("").toUpperCase();
}

type MediaKind = "image" | "audio" | "video" | "sticker" | "document" | "contact" | "location" | "generic";

function getMediaKind(type: string): MediaKind {
  if (type.includes("image"))    return "image";
  if (type.includes("audio"))    return "audio";
  if (type.includes("video"))    return "video";
  if (type.includes("sticker"))  return "sticker";
  if (type.includes("document")) return "document";
  if (type.includes("vcard") || type.includes("contact")) return "contact";
  if (type.includes("location")) return "location";
  return "generic";
}

function mediaLabel(type: string): string {
  const labels: Record<MediaKind, string> = {
    image: "Imagem", audio: "Audio", video: "Video", sticker: "Figurinha",
    document: "Documento", contact: "Contato", location: "Localizacao", generic: "Midia",
  };
  return labels[getMediaKind(type)] ?? "Midia";
}

function isTextMessage(type?: string): boolean {
  if (!type) return true;
  const TEXT_TYPES = ["chat", "extendedTextMessage", "conversation", "notes", "callNotes", "transfer", "transcription"];
  return TEXT_TYPES.some((t) => type === t || type.startsWith(t));
}

// Aviso automatico que o sistema insere no historico quando uma mensagem
// agendada e efetivamente disparada. Chega com mediaType "notes" (e o que faz o
// chat centralizar a linha), mas NAO e nota do atendente: nao entra no contador
// de notas internas e ganha rotulo proprio no lugar da caixa "[Nota interna]".
const SCHEDULE_NOTICE_LABEL = "Mensagem agendada enviada";
function isScheduleNoticeMessage(m: ExportMessage): boolean {
  return !!m.messageId?.startsWith("sched_notice");
}

// Tipos que embutem um arquivo (imagem, áudio, vídeo, documento, figurinha,
// "media" genérico do Baileys). Só são mídia DE FATO quando há uma fonte
// (storageUrl/mediaUrl). Espelha o chat (getMessageContent), que exige mediaUrl
// para renderizar mídia e, sem ela, cai no TextContent exibindo o body.
const FILE_MEDIA_KINDS: ReadonlySet<MediaKind> = new Set<MediaKind>([
  "image", "audio", "video", "document", "sticker", "generic",
]);

function statusLabel(status: string): string {
  const map: Record<string, string> = { open: "Em aberto", pending: "Pendente", closed: "Encerrado" };
  return map[status] ?? status.toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "-";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min`;
  return `${total}s`;
}

function resolveAckLabel(ack?: number): string {
  if (ack === undefined || ack === null) return "";
  if (ack >= 3) return "Lido";
  if (ack === 2) return "Entregue";
  if (ack === 1) return "Enviado";
  return "";
}

function parseHexColor(hex: string, fallback: [number, number, number]): [number, number, number] {
  const clean = (hex ?? "").replace("#", "");
  if (clean.length !== 6) return fallback;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return fallback;
  return [r, g, b];
}

// ─── main export ──────────────────────────────────────────────────────────────
export async function exportChatPdf(ticket: Ticket, rawMessages: unknown[]): Promise<void> {
  const BRAND       = getBrandRgb();
  const BRAND_LIGHT = lighten(BRAND, 0.88);
  const BRAND_XLIGHT= lighten(BRAND, 0.93);
  const ME_BG       = BRAND;
  const ME_TEXT:    [number, number, number] = [255, 255, 255];
  const TS_ME       = lighten(BRAND, 0.55);

  const logo          = await getLogoDataUrl();
  const exportingUser = getExportingUser();

  const doc      = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const fontName = PDF_FONT;
  // Blindagem: tickets sem contato carregado (ou sem nome) faziam o export
  // estourar TypeError ("Cannot read properties of undefined") logo na 1a linha,
  // sem log útil. Garante um objeto mínimo e um name não-vazio para todo o restante.
  const contact = {
    ...(ticket.contact ?? {}),
    name: (ticket.contact?.name && String(ticket.contact.name).trim()) || "Contato",
  } as NonNullable<Ticket["contact"]>;
  const contactPhotoRaw = contact.profilePicUrl
    ? await fetchImageAsDataUrl(resolveMediaUrl(contact.profilePicUrl), 200, 5000)
    : null;
  // Pre-clip to circle on canvas — jsPDF has no path-based clipping for images
  const contactPhoto = contactPhotoRaw
    ? await circleClipImage(contactPhotoRaw.dataUrl, 96)
    : null;
  let y = 0;

  // ── pre-compute stats ────────────────────────────────────────────────────────
  // Ordena por createdAt ASC: o /exportMessages de backends antigos devolve a
  // lista invertida (mais recente primeiro), e o PDF deve ser cronológico.
  const messages      = [...(rawMessages as ExportMessage[])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const nonDeleted    = messages.filter((m) => !m.isDeleted);
  const deletedCount  = messages.filter((m) =>  m.isDeleted).length;
  const sentByAgent   = nonDeleted.filter((m) =>  m.fromMe && m.mediaType !== "notes" && m.mediaType !== "callNotes").length;
  const sentByContact = nonDeleted.filter((m) => !m.fromMe).length;
  // Aviso de disparo de agendada usa mediaType "notes" mas e linha de sistema —
  // fora do contador de notas internas do atendente.
  const internalNotes = nonDeleted.filter(
    (m) => (m.mediaType === "notes" || m.mediaType === "callNotes") && !isScheduleNoticeMessage(m),
  ).length;

  const firstContactMsg = messages.find((m) => !m.fromMe && !m.isDeleted);
  const firstAgentReply = messages.find(
    (m) => m.fromMe && !m.isDeleted && m.mediaType !== "notes" && m.mediaType !== "callNotes"
  );
  const firstResponseMs =
    firstContactMsg && firstAgentReply &&
    new Date(firstAgentReply.createdAt).getTime() > new Date(firstContactMsg.createdAt).getTime()
      ? new Date(firstAgentReply.createdAt).getTime() - new Date(firstContactMsg.createdAt).getTime()
      : null;

  const durationMs = nonDeleted.length > 1
    ? new Date(nonDeleted[nonDeleted.length - 1].createdAt).getTime() - new Date(nonDeleted[0].createdAt).getTime()
    : null;

  // ── page helpers ─────────────────────────────────────────────────────────────
  const fillChatBg = () => {
    doc.setFillColor(...CHAT_BG);
    doc.rect(0, 0, PAGE_W, PAGE_H, "F");
  };

  const drawPageHeader = () => {
    doc.setFillColor(...BRAND_LIGHT);
    doc.rect(0, 0, PAGE_W, 10, "F");
    doc.setFillColor(...BRAND);
    doc.rect(0, 0, 2, 10, "F");
    doc.setFontSize(7.5);
    doc.setFont(fontName, "bold");
    doc.setTextColor(...BRAND);
    doc.text(sanitizeForPdf(`Ticket #${ticket.id}`), MARGIN + 2, 6.5);
    doc.setFont(fontName, "normal");
    doc.setTextColor(...GRAY_MUTED);
    doc.text(
      sanitizeForPdf(`${contact.name}  |  ${displayContactIdentity(contact)}`),
      MARGIN + 22, 6.5,
    );
    y = 16;
  };

  const addPage = () => {
    doc.addPage();
    fillChatBg();
    drawPageHeader();
  };

  const checkSpace = (needed: number) => {
    if (y + needed > PAGE_H - BOTTOM_MARGIN) addPage();
  };

  // ════════════════════════════════════════════════════════════════════════════
  // COVER PAGE
  // ════════════════════════════════════════════════════════════════════════════

  // Header band
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, PAGE_W, 48, "F");

  if (logo) {
    const maxW = 44, maxH = 36;
    const aspect = logo.w / logo.h;
    let drawW = maxW, drawH = maxW / aspect;
    if (drawH > maxH) { drawH = maxH; drawW = maxH * aspect; }
    doc.addImage(logo.dataUrl, logo.format, PAGE_W - MARGIN - drawW, (48 - drawH) / 2, drawW, drawH);
  } else {
    doc.setFillColor(...lighten(BRAND, 0.12));
    doc.circle(PAGE_W - 10, 6, 22, "F");
    doc.setFillColor(...lighten(BRAND, 0.08));
    doc.circle(PAGE_W - 2, 28, 14, "F");
  }

  // Title + subtitle in header band
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont(fontName, "normal");
  doc.setTextColor(...lighten(BRAND, 0.55));
  doc.text("HISTORICO DE ATENDIMENTO", MARGIN, 13);

  doc.setFontSize(20);
  doc.setFont(fontName, "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(sanitizeForPdf(contact.name), MARGIN, 25);

  doc.setFontSize(8.5);
  doc.setFont(fontName, "normal");
  doc.setTextColor(...lighten(BRAND, 0.6));
  doc.text(
    sanitizeForPdf(`Ticket #${ticket.id}  |  ${displayContactIdentity(contact)}  |  Gerado em ${new Date().toLocaleString("pt-BR")}`),
    MARGIN, 34,
  );

  // Audit badge
  doc.setFillColor(...lighten(BRAND, 0.18));
  doc.roundedRect(MARGIN, 38, 47, 6, 1.5, 1.5, "F");
  doc.setFontSize(6.5);
  doc.setFont(fontName, "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("AUDITORIA DE CONVERSA", MARGIN + 3.5, 42.3);

  y = 60;

  // ── Contact card ─────────────────────────────────────────────────────────────
  const contactItems: { label: string; value: string }[] = [];
  if (contact.businessName) contactItems.push({ label: "Empresa",  value: contact.businessName });
  contactItems.push({ label: "Telefone", value: displayContactIdentity(contact) });
  if (contact.email) contactItems.push({ label: "E-mail", value: contact.email });
  if (contact.cpf)   contactItems.push({ label: "CPF",    value: contact.cpf   });
  (contact.extraInfo ?? []).slice(0, 3).forEach((ei) =>
    contactItems.push({ label: ei.name, value: ei.value })
  );
  const contactTags = contact.tags ?? [];
  const CPAD        = 6;
  const CCOLS       = 3;
  const cInfoRows   = Math.ceil(contactItems.length / CCOLS);
  const cTagsH      = contactTags.length > 0 ? 9 : 0;
  const contactCardH = 18 + cInfoRows * 10 + cTagsH + 3;

  // Card shell
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(MARGIN, y, CONTENT_W, contactCardH, 3, 3, "F");
  doc.setDrawColor(...GRAY_BORDER);
  doc.setLineWidth(0.2);
  doc.roundedRect(MARGIN, y, CONTENT_W, contactCardH, 3, 3, "S");
  doc.setFillColor(...BRAND);
  doc.roundedRect(MARGIN, y, 2.5, contactCardH, 1.5, 1.5, "F");

  // Avatar — compact, left-aligned in the header row
  const AV_R    = 6;
  const avatarCX = MARGIN + CPAD + AV_R + 1;
  const avatarCY = y + 9;
  if (contactPhoto) {
    const pd = AV_R * 2;
    doc.addImage(contactPhoto, "PNG", avatarCX - AV_R, avatarCY - AV_R, pd, pd);
    doc.setDrawColor(...BRAND);
    doc.setLineWidth(0.5);
    doc.circle(avatarCX, avatarCY, AV_R, "S");
  } else {
    doc.setFillColor(...BRAND);
    doc.circle(avatarCX, avatarCY, AV_R, "F");
    doc.setFontSize(7);
    doc.setFont(fontName, "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(sanitizeForPdf(initials(contact.name)), avatarCX, avatarCY + 2.2, { align: "center" });
  }

  // Contact name — large, prominent
  doc.setFontSize(14);
  doc.setFont(fontName, "bold");
  doc.setTextColor(17, 24, 39);
  doc.text(sanitizeForPdf(contact.name), avatarCX + AV_R + 4, y + 12);

  // Hairline divider after header
  const cdiv1 = y + 17;
  doc.setDrawColor(...GRAY_BORDER);
  doc.setLineWidth(0.15);
  doc.line(MARGIN + 3, cdiv1, MARGIN + CONTENT_W - 3, cdiv1);

  // Info in a 3-column grid — label small/muted, value larger/bold
  const cColW = (CONTENT_W - CPAD - 3) / CCOLS;
  contactItems.forEach((item, i) => {
    const col = i % CCOLS;
    const row = Math.floor(i / CCOLS);
    const ix  = MARGIN + CPAD + col * cColW;
    const iy  = cdiv1 + 3 + row * 10;
    doc.setFontSize(5.5);
    doc.setFont(fontName, "normal");
    doc.setTextColor(...GRAY_MUTED);
    doc.text(sanitizeForPdf(item.label.toUpperCase()), ix, iy);
    doc.setFontSize(8.5);
    doc.setFont(fontName, "bold");
    doc.setTextColor(17, 24, 39);
    doc.text(sanitizeForPdf(item.value), ix, iy + 6.5);
  });

  // Tags strip
  if (contactTags.length > 0) {
    const cdiv2 = cdiv1 + cInfoRows * 10 + 2;
    doc.setDrawColor(...GRAY_BORDER);
    doc.setLineWidth(0.15);
    doc.line(MARGIN + 3, cdiv2, MARGIN + CONTENT_W - 3, cdiv2);
    let tagX = MARGIN + CPAD;
    const tagY = cdiv2 + 2;
    doc.setFontSize(5.5);
    doc.setFont(fontName, "bold");
    contactTags.forEach((tag) => {
      const name = sanitizeForPdf(tag.name ?? "");
      if (!name || tagX > PAGE_W - MARGIN - 15) return;
      const tw = doc.getTextWidth(name) + 5;
      const [tr, tg, tb] = parseHexColor(tag.color ?? "#8b5cf6", [139, 92, 246]);
      doc.setFillColor(tr, tg, tb);
      doc.roundedRect(tagX, tagY, tw, 4.5, 0.7, 0.7, "F");
      doc.setTextColor(255, 255, 255);
      doc.text(name, tagX + 2.5, tagY + 3.2);
      tagX += tw + 2;
    });
  }

  y += contactCardH + 6;

  // ── Ticket info card ─────────────────────────────────────────────────────────
  const ticketFields: { label: string; value: string; badge?: boolean }[] = [
    { label: "TICKET",  value: `#${ticket.id}` },
    { label: "STATUS",  value: statusLabel(ticket.status), badge: true },
    ...(ticket.queue    ? [{ label: "FILA",         value: ticket.queue.name    }] : []),
    ...(ticket.user     ? [{ label: "AGENTE",        value: ticket.user.name     }] : []),
    ...(ticket.whatsapp ? [{ label: "CANAL",         value: ticket.whatsapp.name }] : []),
    { label: "ABERTURA",    value: new Date(ticket.createdAt).toLocaleString("pt-BR") },
    ...(ticket.status === "closed"
      ? [{ label: "ENCERRAMENTO", value: new Date(ticket.updatedAt).toLocaleString("pt-BR") }]
      : []),
  ];

  const TCOLS      = 3;
  const tColW      = CONTENT_W / TCOLS;
  const tRows      = Math.ceil(ticketFields.length / TCOLS);
  const ticketTags = ticket.tags ?? [];
  const ticketCardH = 10 + tRows * 14 + (ticketTags.length > 0 ? 11 : 4);

  doc.setFillColor(...BRAND_XLIGHT);
  doc.roundedRect(MARGIN, y, CONTENT_W, ticketCardH, 3, 3, "F");
  doc.setDrawColor(...BRAND_LIGHT);
  doc.setLineWidth(0.2);
  doc.roundedRect(MARGIN, y, CONTENT_W, ticketCardH, 3, 3, "S");
  doc.setFillColor(...BRAND);
  doc.roundedRect(MARGIN, y, 2.5, ticketCardH, 1.5, 1.5, "F");

  // Status badge color map
  const STATUS_COLORS: Record<string, [number, number, number]> = {
    "Em aberto": [22, 163, 74],
    "Pendente":  [202, 138, 4],
    "Encerrado": [107, 114, 128],
  };

  ticketFields.forEach((f, i) => {
    const col = i % TCOLS;
    const row = Math.floor(i / TCOLS);
    const fx  = MARGIN + 7 + col * tColW;
    const fy  = y + 10 + row * 14;

    // Field label — small, muted
    doc.setFontSize(5.5);
    doc.setFont(fontName, "normal");
    doc.setTextColor(...GRAY_MUTED);
    doc.text(f.label, fx, fy);

    if (f.badge) {
      // Status pill
      const badgeColor = STATUS_COLORS[f.value] ?? BRAND;
      doc.setFontSize(7);
      doc.setFont(fontName, "bold");
      const badgeW     = doc.getTextWidth(sanitizeForPdf(f.value)) + 10;
      doc.setFillColor(...badgeColor);
      doc.roundedRect(fx, fy + 2, badgeW, 6.5, 1.5, 1.5, "F");
      doc.setTextColor(255, 255, 255);
      doc.text(sanitizeForPdf(f.value), fx + 5, fy + 5.9);
    } else {
      doc.setFontSize(9);
      doc.setFont(fontName, "bold");
      doc.setTextColor(17, 24, 39);
      doc.text(sanitizeForPdf(f.value), fx, fy + 6.5);
    }
  });

  // Ticket tags strip
  if (ticketTags.length > 0) {
    let tagX = MARGIN + 7;
    const tagY = y + ticketCardH - 9;
    doc.setFontSize(5.5);
    doc.setFont(fontName, "bold");
    ticketTags.forEach((tag) => {
      const name = sanitizeForPdf(tag.name ?? tag.tag ?? "");
      if (!name || tagX > PAGE_W - MARGIN - 10) return;
      const tw = doc.getTextWidth(name) + 5;
      const [tr, tg, tb] = parseHexColor(tag.color ?? "#6366f1", [99, 102, 241]);
      doc.setFillColor(tr, tg, tb);
      doc.roundedRect(tagX, tagY, tw, 4.5, 0.7, 0.7, "F");
      doc.setTextColor(255, 255, 255);
      doc.text(name, tagX + 2.5, tagY + 3.2);
      tagX += tw + 2;
    });
  }

  y += ticketCardH + 6;

  // ── Provenance / chain-of-custody ────────────────────────────────────────────
  doc.setFillColor(248, 249, 252);
  doc.roundedRect(MARGIN, y, CONTENT_W, 24, 3, 3, "F");
  doc.setDrawColor(...GRAY_BORDER);
  doc.setLineWidth(0.25);
  doc.roundedRect(MARGIN, y, CONTENT_W, 24, 3, 3, "S");
  // Left accent bar
  doc.setFillColor(...BRAND);
  doc.roundedRect(MARGIN, y, 3, 24, 1.5, 1.5, "F");

  doc.setFontSize(6.5);
  doc.setFont(fontName, "bold");
  doc.setTextColor(...BRAND);
  doc.text("CADEIA DE CUSTODIA DO DOCUMENTO", MARGIN + 7, y + 7);

  const provenanceItems = [
    { label: "Gerado por",           value: exportingUser },
    { label: "Data/hora da geracao", value: new Date().toLocaleString("pt-BR") },
    { label: "Total de mensagens",   value: String(nonDeleted.length) },
    { label: "Mensagens removidas",  value: deletedCount > 0 ? `${deletedCount} (exibidas)` : "Nenhuma" },
  ];
  const provColW = CONTENT_W / provenanceItems.length;
  provenanceItems.forEach((item, i) => {
    const px = MARGIN + 7 + i * provColW;
    doc.setFontSize(5.5);
    doc.setFont(fontName, "normal");
    doc.setTextColor(...GRAY_MUTED);
    doc.text(sanitizeForPdf(item.label), px, y + 13);
    doc.setFontSize(7.5);
    doc.setFont(fontName, "bold");
    doc.setTextColor(17, 24, 39);
    doc.text(sanitizeForPdf(item.value), px, y + 19);
  });

  y += 32;

  // ── Conversation stats card ───────────────────────────────────────────────────
  const sentimentMap: Record<string, string> = {
    positive: "Positivo", neutral: "Neutro", negative: "Negativo", frustrated: "Frustrado",
  };
  const statItems: { label: string; value: string }[] = [
    { label: "Enviadas (agente)",    value: String(sentByAgent)   },
    { label: "Recebidas (contato)", value: String(sentByContact) },
    { label: "Notas internas",      value: String(internalNotes) },
    { label: "1o. tempo de resp.",  value: firstResponseMs !== null ? formatDuration(firstResponseMs) : "N/A" },
    { label: "Duracao total",       value: durationMs !== null ? formatDuration(durationMs) : "N/A" },
    ...(ticket.sentiment
      ? [{ label: "Sentimento (IA)", value: sentimentMap[ticket.sentiment] ?? ticket.sentiment }]
      : []),
  ];

  const statCols = Math.min(statItems.length, 5);
  const statColW = CONTENT_W / statCols;
  const statRows = Math.ceil(statItems.length / statCols);
  const statsCardH = 14 + statRows * 14;

  doc.setFillColor(...BRAND_XLIGHT);
  doc.roundedRect(MARGIN, y, CONTENT_W, statsCardH, 3, 3, "F");
  doc.setDrawColor(...BRAND_LIGHT);
  doc.roundedRect(MARGIN, y, CONTENT_W, statsCardH, 3, 3, "S");

  doc.setFontSize(6.5);
  doc.setFont(fontName, "bold");
  doc.setTextColor(...BRAND);
  doc.text("RESUMO DA CONVERSA", MARGIN + 5, y + 7);

  statItems.forEach((s, i) => {
    const col = i % statCols;
    const row = Math.floor(i / statCols);
    const sx = MARGIN + 5 + col * statColW;
    const sy = y + 13 + row * 14;
    doc.setFontSize(5.5);
    doc.setFont(fontName, "normal");
    doc.setTextColor(...GRAY_MUTED);
    doc.text(sanitizeForPdf(s.label), sx, sy);
    doc.setFontSize(10);
    doc.setFont(fontName, "bold");
    doc.setTextColor(17, 24, 39);
    doc.text(sanitizeForPdf(s.value), sx, sy + 7);
  });

  y += statsCardH + 7;

  // ── Lifecycle timeline ────────────────────────────────────────────────────────
  interface TimelineEvent { label: string; detail: string }

  const transferMsgs = messages.filter((m) => m.mediaType === "transfer" && !m.isDeleted);
  const timelineEvents: TimelineEvent[] = [
    { label: "Abertura",          detail: new Date(ticket.createdAt).toLocaleString("pt-BR") },
    ...(ticket.queue ? [{ label: sanitizeForPdf(`Fila: ${ticket.queue.name}`), detail: "" }] : []),
    ...(ticket.user  ? [{ label: sanitizeForPdf(`Agente: ${ticket.user.name}`), detail: "" }] : []),
    ...transferMsgs.map((m) => ({ label: "Transferencia", detail: formatTime(m.createdAt) })),
    ticket.status === "closed"
      ? { label: "Encerramento", detail: new Date(ticket.updatedAt).toLocaleString("pt-BR") }
      : { label: statusLabel(ticket.status), detail: "" },
  ];

  const evCount = Math.min(timelineEvents.length, 6);
  const timelineH = 28;

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(MARGIN, y, CONTENT_W, timelineH, 3, 3, "F");
  doc.setDrawColor(...GRAY_BORDER);
  doc.roundedRect(MARGIN, y, CONTENT_W, timelineH, 3, 3, "S");

  doc.setFontSize(6.5);
  doc.setFont(fontName, "bold");
  doc.setTextColor(...BRAND);
  doc.text("CICLO DE VIDA DO TICKET", MARGIN + 5, y + 7);

  const lineY  = y + 18;
  const evColW2 = CONTENT_W / evCount;
  // Connecting line
  doc.setDrawColor(...GRAY_BORDER);
  doc.setLineWidth(0.6);
  doc.line(MARGIN + evColW2 / 2, lineY, MARGIN + CONTENT_W - evColW2 / 2, lineY);

  timelineEvents.slice(0, evCount).forEach((ev, i) => {
    const ex = MARGIN + evColW2 / 2 + i * evColW2;
    const isEnd = i === evCount - 1 && ticket.status === "closed";
    doc.setFillColor(...(i === 0 || isEnd ? BRAND : GRAY_BORDER));
    doc.circle(ex, lineY, 2, "F");
    doc.setFontSize(5.5);
    doc.setFont(fontName, "bold");
    doc.setTextColor(17, 24, 39);
    const labelLines = doc.splitTextToSize(ev.label, evColW2 - 4) as string[];
    doc.text(labelLines[0] ?? "", ex, lineY - 5, { align: "center" });
    if (ev.detail) {
      doc.setFontSize(5);
      doc.setFont(fontName, "normal");
      doc.setTextColor(...GRAY_MUTED);
      doc.text(sanitizeForPdf(ev.detail), ex, lineY + 6, { align: "center" });
    }
  });

  y += timelineH + 9;

  // ── Messages section header ───────────────────────────────────────────────────
  doc.setDrawColor(...GRAY_BORDER);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 4;

  doc.setFillColor(...BRAND);
  doc.roundedRect(MARGIN, y, 28, 7, 1.5, 1.5, "F");
  doc.setFontSize(7.5);
  doc.setFont(fontName, "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("MENSAGENS", MARGIN + 4, y + 5);

  doc.setFontSize(7);
  doc.setFont(fontName, "normal");
  doc.setTextColor(...GRAY_MUTED);
  doc.text(
    sanitizeForPdf(`${nonDeleted.length} mensagens${deletedCount > 0 ? `  |  ${deletedCount} removidas` : ""}`),
    MARGIN + 34, y + 5,
  );
  y += 14;

  // ════════════════════════════════════════════════════════════════════════════
  // PRE-FETCH EMBEDDED MEDIA
  // ════════════════════════════════════════════════════════════════════════════
  const mediaCache = new Map<string, LogoData>();
  // "generic" covers Baileys "media" type — fetch it and let fetchImageAsDataUrl
  // reject non-images (blob.type check); if it resolves we show it as an image.
  const EMBEDDABLE = new Set<MediaKind>(["image", "sticker", "generic"]);
  // Prefere storageUrl (S3/R2 público) sobre mediaUrl (caminho local que dá 404
  // quando keepLocalCopy=false) — igual ao getMediaUrl() do chat.
  const mediaSrcOf = (m: ExportMessage): string => m.storageUrl || m.mediaUrl || "";
  const toFetch = messages.filter(
    (m) => !m.isDeleted && mediaSrcOf(m) && EMBEDDABLE.has(getMediaKind(m.mediaType ?? "")) && !isTextMessage(m.mediaType),
  );
  const BATCH = 8;
  for (let bi = 0; bi < toFetch.length; bi += BATCH) {
    await Promise.allSettled(
      toFetch.slice(bi, bi + BATCH).map(async (m) => {
        const data = await fetchImageAsDataUrl(resolveMediaUrl(mediaSrcOf(m)));
        if (data) mediaCache.set(m.id, data);
      }),
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // MESSAGE LOOP
  // ════════════════════════════════════════════════════════════════════════════
  const NUM_PAD = 3; // mm clearance at bubble top for #N index label

  let lastDateLabel = "";
  let prevSenderId  = "";
  let msgIndex      = 0;

  for (const msg of messages) {
    msgIndex++;

    const isDeleted = !!msg.isDeleted;
    // Aviso de disparo de agendada: mesmo layout de linha de sistema da nota
    // (largura total, à esquerda, sem rótulo de remetente), mas com cor e
    // rótulo próprios — ver o bloco de rótulo mais abaixo.
    const isSchedNotice = !isDeleted && isScheduleNoticeMessage(msg);
    const isAgentNote   = !isDeleted && !isSchedNotice && (msg.mediaType === "notes" || msg.mediaType === "callNotes");
    const isNote        = isAgentNote || isSchedNotice;
    const isMe      = msg.fromMe;
    const timeStr   = formatTime(msg.createdAt);

    // ── date separator ──────────────────────────────────────────────────────────
    const dateLabel = formatDate(msg.createdAt);
    if (dateLabel !== lastDateLabel) {
      checkSpace(16);
      lastDateLabel = dateLabel;
      prevSenderId  = "";

      const sanitizedDate = sanitizeForPdf(dateLabel);
      doc.setFontSize(7.5);
      doc.setFont(fontName, "normal");
      const lw = doc.getTextWidth(sanitizedDate) + 12;
      const rx = (PAGE_W - lw) / 2;
      doc.setDrawColor(...GRAY_BORDER);
      doc.setLineWidth(0.3);
      doc.line(MARGIN, y + 4, rx - 3, y + 4);
      doc.line(rx + lw + 3, y + 4, PAGE_W - MARGIN, y + 4);
      doc.setFillColor(218, 220, 224);
      doc.roundedRect(rx, y, lw, 8, 2, 2, "F");
      doc.setTextColor(80, 90, 105);
      doc.text(sanitizedDate, PAGE_W / 2, y + 5.5, { align: "center" });
      y += 11;
    }

    // ── DELETED message placeholder ─────────────────────────────────────────────
    if (isDeleted) {
      prevSenderId = "";
      checkSpace(11);

      const delW  = BUBBLE_MAX;
      const delH  = 9;
      const delBx = isMe ? PAGE_W - MARGIN - delW : MARGIN;

      doc.setFillColor(...DELETED_BG);
      doc.roundedRect(delBx, y, delW, delH, 2, 2, "F");
      doc.setDrawColor(...DELETED_TEXT);
      doc.setLineWidth(0.2);
      doc.setLineDashPattern([1.5, 1.5], 0);
      doc.roundedRect(delBx, y, delW, delH, 2, 2, "S");
      doc.setLineDashPattern([], 0);

      doc.setFontSize(5.5);
      doc.setFont(fontName, "normal");
      doc.setTextColor(...DELETED_TEXT);
      doc.text(`#${msgIndex}`, delBx + 4, y + 3.5);

      doc.setFontSize(7.5);
      doc.text(
        sanitizeForPdf("[Mensagem removida pelo remetente]"),
        delBx + delW / 2, y + 5.8,
        { align: "center" },
      );
      doc.setFontSize(6);
      doc.text(timeStr, delBx + delW - 4, y + 7.5, { align: "right" });

      y += delH + 2;
      continue;
    }

    // ── sender grouping ─────────────────────────────────────────────────────────
    const senderName  = isMe
      ? (msg.user?.name ?? ticket.user?.name ?? "Atendente")
      : (msg.contact?.name ?? contact.name);
    const senderId    = isMe ? "__me__" : (msg.contact?.name ?? contact.name);
    const isNewSender = senderId !== prevSenderId;
    // Aviso de disparo nasce com ack 4 no banco, mas nunca foi entregue a
    // ninguém — imprimir "Lido" numa linha de sistema enganaria quem lê o PDF.
    const ackStr      = isMe && !isSchedNotice ? resolveAckLabel(msg.ack) : "";

    // ── build message body ──────────────────────────────────────────────────────
    const rawKind    = msg.mediaType ? getMediaKind(msg.mediaType) : "generic";
    // Espelha o chat (getMessageContent em message-bubble.tsx): um tipo de mídia
    // de arquivo SEM nenhuma fonte (storageUrl/mediaUrl) mas COM corpo real é, na
    // prática, uma mensagem de texto — o canal apenas rotulou o mediaType errado
    // (ex.: "image"/"media"). Sem este gate, esse texto comum virava "Mídia não
    // disponível" no PDF, escondendo o body que o chat mostra normalmente.
    const hasMediaSrc       = !!(msg.storageUrl || msg.mediaUrl);
    const isOrphanTextMedia = !isTextMessage(msg.mediaType)
      && FILE_MEDIA_KINDS.has(rawKind)
      && !hasMediaSrc
      && (msg.body ?? "").trim() !== "";
    const isMedia    = !isTextMessage(msg.mediaType) && !isOrphanTextMedia;
    const kind       = isOrphanTextMedia ? "generic" : rawKind;
    let bodyText     = sanitizeForPdf(msg.body ?? "");

    if (isMedia) {
      const label    = mediaLabel(msg.mediaType ?? "");
      const fileName = msg.fileName ? sanitizeForPdf(msg.fileName) : "";
      bodyText = fileName
        ? `${label}: ${fileName}`
        : msg.mediaUrl
          ? label
          : bodyText
            ? `${label}: ${bodyText}`
            : label;
    }
    // Aviso de disparo de agendada sem trecho (agendada de mídia sem legenda):
    // fica só o rótulo — "(sem conteudo)" não faria sentido nessa linha.
    if (!bodyText.trim()) bodyText = isSchedNotice ? "" : "(sem conteudo)";

    // ── layout metrics ──────────────────────────────────────────────────────────
    doc.setFontSize(8.5);
    doc.setFont(fontName, "normal");

    const imgData        = mediaCache.get(msg.id);
    const isSticker      = kind === "sticker";
    // "generic" kind = Baileys "media" type; if fetch succeeded it's an image
    const hasEmbeddedImg = !!imgData && (kind === "image" || isSticker || kind === "generic");
    // Lottie/TGS stickers: JSON animations — no browser can render them as static images.
    // Identified by mediaType="lottieStickerMessage" OR a .was/.tgs URL.
    const isLottieSticker    = isSticker && !hasEmbeddedImg && (
      msg.mediaType === "lottieStickerMessage" ||
      /\.(was|tgs)($|\?|#)/i.test(msg.mediaUrl ?? "")
    );
    const STICKER_FALLBACK_H = 26;
    const MEDIA_UNAVAIL_H    = 26;

    // "image", "generic" (Baileys "media"), or non-Lottie sticker that couldn't be embedded
    // = media genuinely unavailable on the server (expired URL, 404, or no URL).
    // Other kinds (video, document, etc.) keep the text-label box since we never fetch those.
    const _wouldUseBox       = isMedia && !["contact", "location"].includes(kind) && !hasEmbeddedImg && kind !== "audio" && !isLottieSticker;
    const isUnavailableMedia = _wouldUseBox && (kind === "image" || kind === "generic" || kind === "sticker");
    const useMediaBox        = _wouldUseBox && !isUnavailableMedia;

    let imgDrawW = 0, imgDrawH = 0;
    if (hasEmbeddedImg && imgData) {
      const maxImgW = isSticker ? 28 : 42;
      const maxImgH = isSticker ? 28 : 32;
      const aspect  = imgData.w / imgData.h;
      imgDrawW = maxImgW; imgDrawH = maxImgW / aspect;
      if (imgDrawH > maxImgH) { imgDrawH = maxImgH; imgDrawW = maxImgH * aspect; }
    }

    const bubbleW = isNote
      ? CONTENT_W
      : hasEmbeddedImg
        ? Math.max(imgDrawW + 12, isSticker ? 36 : 48)
        : isLottieSticker
          ? 36
          : isUnavailableMedia
            ? 48
            : kind === "audio"
              ? Math.min(BUBBLE_MAX, 70)
              : BUBBLE_MAX;

    const innerW = bubbleW - 10;

    let textLines: string[];
    if (useMediaBox) {
      textLines = [`[  ${mediaLabel(msg.mediaType ?? "").toUpperCase()}  ]`];
    } else if (!bodyText || hasEmbeddedImg || kind === "audio" || isLottieSticker || isUnavailableMedia) {
      textLines = [];
    } else {
      textLines = doc.splitTextToSize(bodyText, innerW);
    }

    let actualContentH: number;
    if (hasEmbeddedImg) {
      actualContentH = imgDrawH;
    } else if (isLottieSticker) {
      actualContentH = STICKER_FALLBACK_H;
    } else if (isUnavailableMedia) {
      actualContentH = MEDIA_UNAVAIL_H;
    } else if (kind === "audio") {
      actualContentH = 11;
    } else {
      actualContentH = textLines.length * LINE_H;
    }

    const editedH      = msg.isEdited ? 5 : 0;
    const senderLabelH = !isNote ? 5 : 0;
    const bubbleH      = NUM_PAD + actualContentH + 8 + editedH;
    const totalH       = senderLabelH + bubbleH + 5;

    checkSpace(totalH + 2);

    // ── sender label (every bubble, both sides) ────────────────────────────────
    if (!isNote) {
      doc.setFontSize(7.5);
      doc.setFont(fontName, "bold");
      doc.setTextColor(...BRAND);
      if (isMe) {
        doc.text(sanitizeForPdf(senderName), PAGE_W - MARGIN, y + 4.5, { align: "right" });
      } else {
        doc.text(sanitizeForPdf(senderName), MARGIN, y + 4.5);
      }
      y += senderLabelH;
    }
    prevSenderId = senderId;

    // ── bubble position ─────────────────────────────────────────────────────────
    let bx: number;
    let bgColor:   [number, number, number];
    let textColor: [number, number, number];
    let tsColor:   [number, number, number];

    if (isSchedNotice) {
      bx = MARGIN;              bgColor = SCHED_BG; textColor = SCHED_TEXT; tsColor = SCHED_TEXT;
    } else if (isNote) {
      bx = MARGIN;              bgColor = NOTE_BG;  textColor = NOTE_TEXT; tsColor = NOTE_TEXT;
    } else if (isMe) {
      bx = PAGE_W - MARGIN - bubbleW;    bgColor = ME_BG;   textColor = ME_TEXT;  tsColor = TS_ME;
    } else {
      bx = MARGIN;              bgColor = THEM_BG;  textColor = THEM_TEXT; tsColor = TS_THEM;
    }

    // ── bubble background ───────────────────────────────────────────────────────
    doc.setFillColor(...bgColor);
    doc.roundedRect(bx, y, bubbleW, bubbleH, 3, 3, "F");

    // ── bubble tail (first message of each group) ───────────────────────────────
    if (!isNote && isNewSender) {
      doc.setFillColor(...bgColor);
      if (isMe) {
        doc.triangle(bx + bubbleW, y + 4, bx + bubbleW + 5, y + 7, bx + bubbleW, y + 11, "F");
      } else {
        doc.triangle(bx, y + 4, bx - 5, y + 7, bx, y + 11, "F");
      }
    }

    // ── media box (text label fallback for non-embedded media) ─────────────────
    if (useMediaBox) {
      const boxX = bx + 5, boxY = y + 4 + NUM_PAD;
      const boxW = bubbleW - 10, boxH = textLines.length * LINE_H + 1;
      doc.setDrawColor(...tsColor);
      doc.setLineWidth(0.25);
      doc.roundedRect(boxX, boxY, boxW, boxH + 1, 2, 2, "S");
    }

    // ── embedded image (image / sticker fetched successfully) ───────────────────
    if (hasEmbeddedImg && imgData) {
      const imgX = bx + (bubbleW - imgDrawW) / 2;
      const imgY = y + 4 + NUM_PAD;
      doc.addImage(imgData.dataUrl, imgData.format, imgX, imgY, imgDrawW, imgDrawH);
    }

    // ── sticker fallback (animated / Lottie stickers that can't be embedded) ────
    if (isLottieSticker) {
      drawStickerFallback(doc, bx + 5, y + 4 + NUM_PAD, bubbleW - 10, STICKER_FALLBACK_H, tsColor, fontName);
    }

    // ── media unavailable (image/generic whose URL is missing or fetch failed) ───
    if (isUnavailableMedia) {
      drawMediaUnavailable(doc, bx + 5, y + 4 + NUM_PAD, bubbleW - 10, MEDIA_UNAVAIL_H, fontName);
    }

    // ── audio waveform ───────────────────────────────────────────────────────────
    if (!hasEmbeddedImg && kind === "audio") {
      drawAudioWaveform(doc, bx + 5, y + NUM_PAD + 8, bubbleW - 10, 4, tsColor);
    }

    // ── message text ─────────────────────────────────────────────────────────────
    if (textLines.length > 0) {
      doc.setFontSize(8.5);
      doc.setFont(fontName, useMediaBox ? "bold" : "normal");
      doc.setTextColor(...textColor);
      doc.text(textLines, bx + 5, y + 5.5 + NUM_PAD + (useMediaBox ? 0.5 : 0));
    }

    // ── edited indicator ─────────────────────────────────────────────────────────
    if (msg.isEdited) {
      doc.setFontSize(6.5);
      doc.setFont(fontName, "italic");
      doc.setTextColor(...tsColor);
      doc.text("(editada)", bx + 5, y + NUM_PAD + 5.5 + actualContentH + 1.5);
    }

    // ── internal note / schedule notice label ─────────────────────────────────────
    if (isNote) {
      doc.setFontSize(7);
      doc.setFont(fontName, "bold");
      doc.setTextColor(...(isSchedNotice ? SCHED_TEXT : NOTE_TEXT));
      doc.text(
        sanitizeForPdf(isSchedNotice ? `[${SCHEDULE_NOTICE_LABEL}]` : `[Nota interna] ${senderName}`),
        bx + 5,
        y + NUM_PAD + 5.5 + actualContentH + editedH + 0.5,
      );
    }

    // ── message number (#N, top-left of bubble, tiny) ────────────────────────────
    doc.setFontSize(5.5);
    doc.setFont(fontName, "normal");
    doc.setTextColor(...tsColor);
    doc.text(`#${msgIndex}`, bx + 4, y + 3.5);

    // ── timestamp + ack status (bottom-right) ───────────────────────────────────
    doc.setFontSize(6.5);
    doc.setFont(fontName, "normal");
    doc.setTextColor(...tsColor);
    const tsLine = sanitizeForPdf(ackStr ? `${ackStr}  ${timeStr}` : timeStr);
    doc.text(tsLine, bx + bubbleW - 4, y + bubbleH - 2.5, { align: "right" });

    y += bubbleH + 2;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SIGNATURE BLOCK
  // ════════════════════════════════════════════════════════════════════════════
  checkSpace(62);
  y += 8;

  doc.setDrawColor(...GRAY_BORDER);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 6;

  doc.setFillColor(248, 249, 252);
  doc.roundedRect(MARGIN, y, CONTENT_W, 48, 3, 3, "F");
  doc.setDrawColor(...GRAY_BORDER);
  doc.setLineWidth(0.25);
  doc.roundedRect(MARGIN, y, CONTENT_W, 48, 3, 3, "S");
  doc.setFillColor(...BRAND);
  doc.roundedRect(MARGIN, y, 3, 48, 1.5, 1.5, "F");

  doc.setFontSize(6.5);
  doc.setFont(fontName, "bold");
  doc.setTextColor(...BRAND);
  doc.text("ASSINATURAS E VALIDA\xC7\xC3O", MARGIN + 7, y + 7);

  doc.setFontSize(6);
  doc.setFont(fontName, "normal");
  doc.setTextColor(...GRAY_MUTED);
  doc.text(
    sanitizeForPdf(
      "Este documento e um registro fiel da conversa exportado pelo sistema. Assine abaixo para atestar veracidade."
    ),
    MARGIN + 7, y + 13,
  );

  const sigColW = CONTENT_W / 3;
  const sigLabels = ["Responsavel pelo Atendimento", "Supervisor / Gestor", "Cliente / Contato"];
  sigLabels.forEach((label, i) => {
    const sx     = MARGIN + 7 + i * sigColW;
    const lineY2 = y + 33;
    doc.setDrawColor(185, 190, 200);
    doc.setLineWidth(0.25);
    doc.line(sx, lineY2, sx + sigColW - 8, lineY2);
    doc.setFontSize(6);
    doc.setFont(fontName, "normal");
    doc.setTextColor(...GRAY_MUTED);
    doc.text(sanitizeForPdf(label), sx, lineY2 + 4);
    doc.text("Data: ___/___/______", sx, lineY2 + 9);
  });

  // ════════════════════════════════════════════════════════════════════════════
  // FOOTERS (all pages)
  // ════════════════════════════════════════════════════════════════════════════
  // @ts-expect-error jspdf internal
  const totalPages = doc.internal.getNumberOfPages() as number;
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFillColor(...BRAND_LIGHT);
    doc.rect(0, PAGE_H - 10, PAGE_W, 10, "F");
    doc.setFillColor(...BRAND);
    doc.rect(0, PAGE_H - 10, PAGE_W, 0.6, "F");
    doc.setFontSize(7);
    doc.setFont(fontName, "normal");
    doc.setTextColor(...GRAY_MUTED);
    doc.text(
      sanitizeForPdf(`Pagina ${p} de ${totalPages}  |  Ticket #${ticket.id}  |  ${contact.name}`),
      PAGE_W / 2, PAGE_H - 3.5, { align: "center" },
    );
  }

  // ── save ──────────────────────────────────────────────────────────────────────
  const safeName = contact.name.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_");
  doc.save(`historico_${safeName}_ticket_${ticket.id}.pdf`);
}
