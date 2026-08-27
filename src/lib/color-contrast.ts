/**
 * Retorna "#000" ou "#fff" — o que der melhor contraste sobre `hex` — seguindo WCAG.
 *
 * Aceita `#rgb`, `#rrggbb`, `#rrggbbaa` e strings sem `#`. Hex inválido cai em fallback `#fff`.
 * Threshold 0.179 é o ponto WCAG onde branco e preto têm contraste equivalente sobre a cor.
 */
export function getReadableTextColor(hex: string | null | undefined): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#fff";
  return luminanceOf(rgb) < 0.179 ? "#fff" : "#000";
}

/** Normaliza `#rgb`/`#rrggbb`/`#rrggbbaa` (com ou sem `#`) em canais 0..1. */
function hexToRgb(hex: string | null | undefined): [number, number, number] | null {
  if (!hex) return null;
  let clean = hex.trim().replace(/^#/, "");
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  } else if (clean.length === 8) {
    clean = clean.slice(0, 6);
  }
  if (clean.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  ];
}

function luminanceOf([r, g, b]: [number, number, number]): number {
  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Luminância relativa (WCAG) de uma cor hex. Hex inválido → 0. */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  return rgb ? luminanceOf(rgb) : 0;
}

/** Razão de contraste WCAG (1..21) entre duas cores hex opacas. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Converte "H S% L%" (formato das vars shadcn) em componentes numéricos. */
export function parseHslVar(
  value: string | null | undefined
): { h: number; s: number; l: number } | null {
  const m = (value || "").trim().match(/^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!m) return null;
  const [h, s, l] = [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
  return Number.isFinite(h) && Number.isFinite(s) && Number.isFinite(l) ? { h, s, l } : null;
}

/** HSL (h em graus, s/l em %) → hex "#rrggbb". */
export function hslToHex(h: number, s: number, l: number): string {
  const sN = Math.min(100, Math.max(0, s)) / 100;
  const lN = Math.min(100, Math.max(0, l)) / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const hh = ((((h % 360) + 360) % 360)) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = lN - c / 2;
  const rgb: [number, number, number] =
    hh < 1 ? [c, x, 0] :
    hh < 2 ? [x, c, 0] :
    hh < 3 ? [0, c, x] :
    hh < 4 ? [0, x, c] :
    hh < 5 ? [x, 0, c] : [c, 0, x];
  const channel = (v: number) =>
    Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${channel(rgb[0])}${channel(rgb[1])}${channel(rgb[2])}`;
}

/** Compõe `fg` com opacidade `alpha` sobre `bg` (ambos hex opacos). */
export function blendHex(fg: string, alpha: number, bg: string): string {
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  if (!f || !b) return bg;
  const a = Math.min(1, Math.max(0, alpha));
  const channel = (i: number) =>
    Math.round((f[i] * a + b[i] * (1 - a)) * 255).toString(16).padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/**
 * Controle de luminância: preserva matiz/saturação da cor e move SÓ a luminância
 * (para baixo em superfície clara, para cima em superfície escura) até o contraste
 * sobre `surface` atingir `minRatio`.
 *
 * Serve para tons semânticos usados como texto sobre o próprio fundo translúcido
 * (`text-warning` sobre `bg-warning/10`), onde a cor crua fica ilegível no tema claro.
 * Fallback (inalcançável na prática): preto/branco por contraste simples.
 */
export function readableHslOnSurface(
  hsl: { h: number; s: number; l: number },
  surface: string,
  minRatio = 4.5
): string {
  const base = hslToHex(hsl.h, hsl.s, hsl.l);
  if (contrastRatio(base, surface) >= minRatio) return base;

  const step = relativeLuminance(surface) > 0.179 ? -2 : 2;
  for (let l = hsl.l + step; l >= 0 && l <= 100; l += step) {
    const candidate = hslToHex(hsl.h, hsl.s, l);
    if (contrastRatio(candidate, surface) >= minRatio) return candidate;
  }
  return getReadableTextColor(surface);
}
