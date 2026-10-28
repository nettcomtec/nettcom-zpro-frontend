import { FORM_LIMITS, FORM_THEME_DEFAULTS, type FormTheme } from "@/lib/forms";

/*
 * Aparência do formulário público (D14): cores, esquema, cantos e largura viram
 * variáveis CSS com escopo na raiz `data-form-root` — nunca os tokens do tema do painel
 * (bg-card, text-foreground...), senão o operador logado no mesmo navegador mudaria o
 * visual da página do cliente (B15). Os tokens que o PhoneInput e a lista de países usam
 * (--background, --input, --popover...) são redefinidos DENTRO da raiz com as cores do
 * formulário.
 *
 * Tudo que entra no CSS sai daqui (cores validadas como #rrggbb, números fixos): nada
 * digitado pelo administrador é copiado para dentro do <style>.
 */

export type FormFrameMode = "page" | "embed" | "preview";
type Scheme = "light" | "dark";

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const safeColor = (value: unknown, fallback: string): string =>
  typeof value === "string" && COLOR_RE.test(value) ? value.toLowerCase() : fallback;

const safeText = (value: unknown, max: number): string | undefined => {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text.slice(0, max) : undefined;
};

const parseUrl = (value: unknown): URL | null => {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.length > FORM_LIMITS.urlMax) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
};

/** Endereço para navegar (redirecionamento final): só https. */
export const safeHttpsUrl = (value: unknown): string | null => {
  const url = parseUrl(value);
  return url && url.protocol === "https:" ? url.toString() : null;
};

/** Imagem (logo/capa): https; http só sai em dev (o CSP de produção bloqueia). */
const safeImageUrl = (value: unknown): string | undefined => {
  const url = parseUrl(value);
  return url && (url.protocol === "https:" || url.protocol === "http:") ? url.toString() : undefined;
};

/**
 * Tema pronto para desenhar. O backend já saneia (sanitizeFormTheme); aqui vale de novo
 * porque a prévia do editor passa o que está sendo digitado.
 */
export function normalizePublicFormTheme(raw: Partial<FormTheme> | null | undefined): FormTheme {
  const src: Partial<FormTheme> = raw && typeof raw === "object" ? raw : {};
  return {
    primaryColor: safeColor(src.primaryColor, FORM_THEME_DEFAULTS.primaryColor),
    backgroundColor: safeColor(src.backgroundColor, FORM_THEME_DEFAULTS.backgroundColor),
    colorScheme: src.colorScheme === "light" || src.colorScheme === "dark" ? src.colorScheme : "auto",
    radius: src.radius === "none" || src.radius === "large" ? src.radius : "small",
    width: src.width === "wide" ? "wide" : "narrow",
    logoUrl: safeImageUrl(src.logoUrl),
    coverUrl: safeImageUrl(src.coverUrl),
    title: safeText(src.title, FORM_LIMITS.themeTitleMax),
    description: safeText(src.description, FORM_LIMITS.themeDescriptionMax),
    submitLabel: safeText(src.submitLabel, FORM_LIMITS.themeSubmitLabelMax),
    successMessage: safeText(src.successMessage, FORM_LIMITS.themeSuccessMessageMax),
    redirectUrl: safeHttpsUrl(src.redirectUrl) || undefined,
  };
}

// ── Cores ─────────────────────────────────────────────────────────────────────
interface Rgb {
  r: number;
  g: number;
  b: number;
}

const hexToRgb = (hex: string): Rgb => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
});

const toHex2 = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");

const rgbToHex = ({ r, g, b }: Rgb): string => `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;

/** Mistura `a` com `b` (peso de `b` entre 0 e 1). */
const mixHex = (a: string, b: string, weightB: number): string => {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const w = Math.max(0, Math.min(1, weightB));
  return rgbToHex({ r: x.r + (y.r - x.r) * w, g: x.g + (y.g - x.g) * w, b: x.b + (y.b - x.b) * w });
};

const channel = (c: number): number => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

const luminance = (hex: string): number => {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrastRatio = (a: string, b: string): number => {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
};

const rgbToHsl = ({ r, g, b }: Rgb): { h: number; s: number; l: number } => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;
  }
  return { h: h * 360, s, l };
};

const hueToChannel = (p: number, q: number, tIn: number): number => {
  let t = tIn;
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
};

const hslToHex = (h: number, s: number, l: number): string => {
  if (s === 0) {
    const v = l * 255;
    return rgbToHex({ r: v, g: v, b: v });
  }
  const hn = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return rgbToHex({
    r: hueToChannel(p, q, hn + 1 / 3) * 255,
    g: hueToChannel(p, q, hn) * 255,
    b: hueToChannel(p, q, hn - 1 / 3) * 255,
  });
};

/** Token do painel ("h s% l%"): o Tailwind do painel lê hsl(var(--x)). */
const hslTriplet = (hex: string): string => {
  const { h, s, l } = rgbToHsl(hexToRgb(hex));
  return `${Math.round(h)} ${Math.round(s * 1000) / 10}% ${Math.round(l * 1000) / 10}%`;
};

const rgba = (hex: string, alpha: number): string => {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** Cor principal ajustada até ter contraste mínimo (3:1) sobre a superfície. */
const readableOn = (color: string, surface: string, towards: string): string => {
  let out = color;
  for (let i = 0; i < 6 && contrastRatio(out, surface) < 3; i += 1) out = mixHex(out, towards, 0.25);
  return out;
};

/** Fundo da página no escuro: cor escolhida clara vira a mesma matiz bem escura. */
const darkPageOf = (background: string): string => {
  const { h, s, l } = rgbToHsl(hexToRgb(background));
  if (l <= 0.3) return background;
  return hslToHex(h, Math.min(s, 0.3), 0.07);
};

interface FormPalette {
  scheme: Scheme;
  page: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  inputBg: string;
  inputBorder: string;
  hover: string;
  error: string;
  primary: string;
  onPrimary: string;
  primaryBorder: string;
  accent: string;
  focus: string;
  errorFocus: string;
  errorBg: string;
  errorBorder: string;
  badge: string;
  shadowXs: string;
  shadowMd: string;
  cardShadow: string;
}

const LIGHT_BASE = {
  surface: "#ffffff",
  text: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  inputBg: "#ffffff",
  inputBorder: "#cbd5e1",
  hover: "#f1f5f9",
  error: "#dc2626",
};

const DARK_BASE = {
  surface: "#111827",
  text: "#f3f4f6",
  muted: "#9ca3af",
  border: "#374151",
  inputBg: "#1f2937",
  inputBorder: "#4b5563",
  hover: "#1f2937",
  error: "#f87171",
};

function buildPalette(theme: FormTheme, scheme: Scheme): FormPalette {
  const base = scheme === "dark" ? DARK_BASE : LIGHT_BASE;
  const primary = theme.primaryColor;
  const onPrimary = contrastRatio(primary, "#ffffff") >= contrastRatio(primary, "#0f172a") ? "#ffffff" : "#0f172a";
  const accent = readableOn(primary, base.surface, scheme === "dark" ? "#ffffff" : "#000000");
  const dark = scheme === "dark";
  return {
    scheme,
    page: dark ? darkPageOf(theme.backgroundColor) : theme.backgroundColor,
    ...base,
    primary,
    onPrimary,
    // Botão da cor da superfície (ex.: branco no branco) ganha a borda dos campos.
    primaryBorder: contrastRatio(primary, base.surface) < 1.3 ? base.inputBorder : primary,
    accent,
    focus: rgba(accent, dark ? 0.45 : 0.25),
    errorFocus: rgba(base.error, 0.25),
    errorBg: mixHex(base.surface, base.error, dark ? 0.14 : 0.07),
    errorBorder: mixHex(base.surface, base.error, dark ? 0.4 : 0.3),
    badge: mixHex(base.surface, accent, dark ? 0.22 : 0.14),
    shadowXs: dark ? "0 1px 2px rgba(0, 0, 0, 0.3)" : "0 1px 2px rgba(15, 23, 42, 0.05)",
    shadowMd: dark ? "0 8px 24px rgba(0, 0, 0, 0.5)" : "0 4px 12px -2px rgba(15, 23, 42, 0.14)",
    cardShadow: dark
      ? "0 1px 2px rgba(0, 0, 0, 0.4), 0 12px 32px -12px rgba(0, 0, 0, 0.6)"
      : "0 1px 2px rgba(15, 23, 42, 0.06), 0 12px 32px -12px rgba(15, 23, 42, 0.18)",
  };
}

const RADIUS: Record<FormTheme["radius"], { card: string; input: string; panel: string }> = {
  // `panel` = --radius do painel: o rounded-md do PhoneInput é calc(var(--radius) - 2px).
  none: { card: "0px", input: "0px", panel: "2px" },
  small: { card: "12px", input: "8px", panel: "10px" },
  large: { card: "20px", input: "14px", panel: "16px" },
};

const varsOf = (p: FormPalette): string =>
  [
    `--fr-page:${p.page}`,
    `--fr-surface:${p.surface}`,
    `--fr-text:${p.text}`,
    `--fr-muted:${p.muted}`,
    `--fr-border:${p.border}`,
    `--fr-input-bg:${p.inputBg}`,
    `--fr-input-border:${p.inputBorder}`,
    `--fr-hover:${p.hover}`,
    `--fr-primary:${p.primary}`,
    `--fr-on-primary:${p.onPrimary}`,
    `--fr-primary-border:${p.primaryBorder}`,
    `--fr-accent:${p.accent}`,
    `--fr-focus:${p.focus}`,
    `--fr-error:${p.error}`,
    `--fr-error-focus:${p.errorFocus}`,
    `--fr-error-bg:${p.errorBg}`,
    `--fr-error-border:${p.errorBorder}`,
    `--fr-badge:${p.badge}`,
    `--fr-card-shadow:${p.cardShadow}`,
    // Tokens do painel usados pelo PhoneInput e pela lista de países (portal na raiz).
    `--background:${hslTriplet(p.inputBg)}`,
    `--foreground:${hslTriplet(p.text)}`,
    `--input:${hslTriplet(p.inputBorder)}`,
    `--ring:${hslTriplet(p.accent)}`,
    `--accent:${hslTriplet(p.hover)}`,
    `--accent-foreground:${hslTriplet(p.text)}`,
    `--muted:${hslTriplet(p.hover)}`,
    `--muted-foreground:${hslTriplet(p.muted)}`,
    `--popover:${hslTriplet(p.surface)}`,
    `--popover-foreground:${hslTriplet(p.text)}`,
    `--border:${hslTriplet(p.border)}`,
    `--primary:${hslTriplet(p.primary)}`,
    `--primary-foreground:${hslTriplet(p.onPrimary)}`,
    `--shadow-xs:${p.shadowXs}`,
    `--shadow-md:${p.shadowMd}`,
    `color-scheme:${p.scheme}`,
  ].join(";");

const componentRules = (s: string): string[] => [
  `${s} .fr-page{background-color:var(--fr-page)}`,
  `${s} .fr-container{width:100%;max-width:var(--fr-width);margin-left:auto;margin-right:auto}`,
  `${s} .fr-card{background-color:var(--fr-surface);border:1px solid var(--fr-border);border-radius:var(--fr-radius);overflow:hidden}`,
  `${s} .fr-card-shadow{box-shadow:var(--fr-card-shadow)}`,
  `${s} .fr-muted{color:var(--fr-muted)}`,
  `${s} .fr-accent{color:var(--fr-accent)}`,
  `${s} .fr-error{color:var(--fr-error)}`,
  `${s} .fr-label{color:var(--fr-text)}`,
  `${s} .fr-control{display:block;width:100%;min-width:0;min-height:2.5rem;margin:0;padding:.5rem .75rem;font:inherit;font-size:.875rem;line-height:1.25rem;color:var(--fr-text);background-color:var(--fr-input-bg);border:1px solid var(--fr-input-border);border-radius:var(--fr-radius-input);box-shadow:var(--shadow-xs);outline:none;transition:border-color .15s,box-shadow .15s}`,
  `${s} textarea.fr-control{min-height:6rem;resize:vertical}`,
  `${s} select.fr-control{cursor:pointer}`,
  `${s} .fr-control::placeholder{color:var(--fr-muted);opacity:1}`,
  `${s} .fr-control:focus{border-color:var(--fr-accent);box-shadow:0 0 0 3px var(--fr-focus)}`,
  `${s} .fr-control[aria-invalid="true"]{border-color:var(--fr-error)}`,
  `${s} .fr-control[aria-invalid="true"]:focus{box-shadow:0 0 0 3px var(--fr-error-focus)}`,
  `${s} .fr-control::-webkit-date-and-time-value{text-align:start}`,
  `${s} .fr-check{width:1.0625rem;height:1.0625rem;flex-shrink:0;margin:.15rem 0 0;accent-color:var(--fr-accent);cursor:pointer}`,
  `${s} .fr-check:focus-visible{outline:2px solid var(--fr-accent);outline-offset:2px}`,
  `${s} .fr-phone-invalid{border-color:var(--fr-error)}`,
  `${s} .fr-submit{display:inline-flex;width:100%;align-items:center;justify-content:center;gap:.5rem;min-height:2.75rem;margin:0;padding:.625rem 1rem;font:inherit;font-size:.9375rem;font-weight:600;line-height:1.25rem;color:var(--fr-on-primary);background-color:var(--fr-primary);border:1px solid var(--fr-primary-border);border-radius:var(--fr-radius-input);cursor:pointer;transition:filter .15s,opacity .15s}`,
  `${s} .fr-submit:hover:not(:disabled){filter:brightness(1.06)}`,
  `${s} .fr-submit:focus-visible{outline:2px solid var(--fr-accent);outline-offset:2px}`,
  `${s} .fr-submit:disabled{opacity:.7;cursor:default}`,
  `${s} .fr-link{color:var(--fr-accent);font-weight:600;text-decoration:underline;text-underline-offset:2px}`,
  `${s} .fr-link:focus-visible{outline:2px solid var(--fr-accent);outline-offset:2px;border-radius:2px}`,
  `${s} .fr-badge{background-color:var(--fr-badge);color:var(--fr-accent)}`,
  `${s} .fr-alert{color:var(--fr-error);background-color:var(--fr-error-bg);border:1px solid var(--fr-error-border);border-radius:var(--fr-radius-input)}`,
  // Duas colunas pela largura do PRÓPRIO formulário (container query), não da janela:
  // vale igual no iframe e na prévia do editor. Navegador sem container query cai na
  // largura da janela (sm).
  `${s} .fr-fields{container-type:inline-size}`,
  `${s} .fr-grid{display:grid;grid-template-columns:minmax(0,1fr);column-gap:1rem;row-gap:1.25rem}`,
  `${s} .fr-span-full{grid-column:1/-1}`,
  `@container (min-width: 24rem){${s} .fr-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}`,
  `@supports not (container-type: inline-size){@media (min-width: 640px){${s} .fr-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}}`,
];

/**
 * CSS da raiz do formulário. `scope` = valor do atributo data-form-root (só
 * [A-Za-z0-9_-]). Página e iframe também ajustam o documento: na página o fundo do
 * html/body segue o formulário (rolagem elástica, barra de rolagem); no iframe html/body
 * ficam transparentes e com color-scheme "normal" — com o esquema diferente do da página
 * de quem embute, o navegador pinta o iframe opaco. Na prévia do editor, nada fora da raiz.
 */
export function buildFormThemeCss(scope: string, theme: FormTheme, mode: FormFrameMode): string {
  const safeScope = scope.replace(/[^A-Za-z0-9_-]/g, "") || "fr";
  const sel = `[data-form-root="${safeScope}"]`;
  const light = buildPalette(theme, "light");
  const dark = buildPalette(theme, "dark");
  const main = theme.colorScheme === "dark" ? dark : light;
  const radius = RADIUS[theme.radius] || RADIUS.small;
  const width = theme.width === "wide" ? "42rem" : "28rem";
  const css: string[] = [
    `${sel}{${varsOf(main)};--fr-radius:${radius.card};--fr-radius-input:${radius.input};--radius:${radius.panel};--fr-width:${width};color:var(--fr-text);font-family:var(--font-sans),system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.5;-webkit-text-size-adjust:100%;text-size-adjust:100%}`,
  ];
  if (theme.colorScheme === "auto") css.push(`@media (prefers-color-scheme: dark){${sel}{${varsOf(dark)}}}`);
  css.push(...componentRules(sel));
  if (mode === "embed") {
    css.push("html,body{background:transparent!important;background-color:transparent!important}html{color-scheme:normal!important}");
  } else if (mode === "page") {
    const scheme = theme.colorScheme === "auto" ? "light dark" : theme.colorScheme;
    css.push(`html,body{background-color:${main.page}!important}html{color-scheme:${scheme}!important}`);
    if (theme.colorScheme === "auto") {
      css.push(`@media (prefers-color-scheme: dark){html,body{background-color:${dark.page}!important}}`);
    }
  }
  return css.join("\n");
}
