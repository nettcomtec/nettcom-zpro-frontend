/**
 * Normaliza input de cor (array de objetos ou objeto flat) para Record<string,string>.
 */
function normalizeColorInput(
  input: Array<Record<string, string>> | Record<string, string>
): Record<string, string> {
  const flat: Record<string, string> = {};
  if (Array.isArray(input)) {
    input.forEach((item) => {
      Object.entries(item).forEach(([k, v]) => { if (k !== "label") flat[k] = v; });
    });
  } else {
    Object.assign(flat, input);
  }
  return flat;
}

/**
 * Converte cor hex (#rrggbb) para string HSL no formato do shadcn/ui ("H S% L%").
 */
export function hexToHsl(hex: string): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return "";

  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * Mapeamento das chaves de cor da paleta de branding
 * para as variáveis CSS do shadcn/ui usadas pelo frontendNovo.
 */
const BRAND_TO_SHADCN: Record<string, string[]> = {
  primary:  ["--primary", "--ring", "--sidebar-primary"],
  accent:   ["--accent", "--sidebar-accent"],
  warning:  ["--warning"],
  negative: ["--destructive"],
  positive: ["--success"],
};

/** Todas as variáveis shadcn que podem ser sobrescritas por marca. */
const ALL_SHADCN_VARS = Object.values(BRAND_TO_SHADCN).flat();

/** Foregrounds derivados por contraste — limpos junto com as vars de fundo. */
const SHADCN_FOREGROUND_VARS = [
  "--primary-foreground",
  "--sidebar-primary-foreground",
  "--accent-foreground",
  "--sidebar-accent-foreground",
];

/**
 * Remove as variáveis shadcn de branding do inline style do :root,
 * permitindo que as regras CSS do .dark (globals.css) assumam o controle.
 */
function removeShadcnBrandVars(): void {
  const root = document.documentElement;
  ALL_SHADCN_VARS.forEach((cssVar) => root.style.removeProperty(cssVar));
  SHADCN_FOREGROUND_VARS.forEach((cssVar) => root.style.removeProperty(cssVar));
}

/**
 * Calcula a luminância relativa de uma cor hex e retorna o foreground ideal
 * ("0 0% 100%" para cores escuras, "0 0% 5%" para cores claras).
 */
function contrastForeground(hex: string): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return "0 0% 100%";
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  // Relative luminance (WCAG)
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return L < 0.179 ? "0 0% 100%" : "0 0% 5%";
}

/**
 * Aplica paleta shadcn (--primary etc.) a partir de um objeto flat de cores hex.
 */
function applyShadcnVars(flat: Record<string, string>): void {
  const root = document.documentElement;
  Object.entries(flat).forEach(([key, value]) => {
    if (!value) return;
    const shadcnVars = BRAND_TO_SHADCN[key];
    if (shadcnVars) {
      const hsl = hexToHsl(value);
      if (hsl) {
        shadcnVars.forEach((cssVar) => root.style.setProperty(cssVar, hsl));
        // Ajusta automaticamente os foregrounds para garantir contraste
        if (key === "primary") {
          const fg = contrastForeground(value);
          root.style.setProperty("--primary-foreground", fg);
          root.style.setProperty("--sidebar-primary-foreground", fg);
        }
        if (key === "accent") {
          const fg = contrastForeground(value);
          root.style.setProperty("--accent-foreground", fg);
          root.style.setProperty("--sidebar-accent-foreground", fg);
        }
      }
    }
  });
}

/**
 * Aplica a paleta de cores ao documento.
 *
 * - Sempre define --q-<key> (compatibilidade legado Vue/Quasar).
 * - Modo claro: aplica paleta `input` às variáveis shadcn (--primary, etc.) em HSL.
 * - Modo escuro SEM paleta dark: remove overrides shadcn e deixa globals.css .dark assumir.
 * - Modo escuro COM paleta dark (`darkInput`): aplica `darkInput` às variáveis shadcn.
 *
 * Aceita array do banco [ {label, primary: "#xxx"}, ... ] ou objeto flat.
 */
export function applyBrandColors(
  input: Array<Record<string, string>> | Record<string, string>,
  isDark = false,
  darkInput?: Array<Record<string, string>> | Record<string, string>
): void {
  if (typeof document === "undefined") return;

  const flat = normalizeColorInput(input);
  const root = document.documentElement;

  // SEMPRE remove overrides shadcn antes de reaplicar — evita que cores do modo
  // anterior (ex: --accent light) persistam quando a paleta nova nao define
  // aquela chave. Inline style tem prioridade maior que regras .dark do CSS.
  removeShadcnBrandVars();

  if (isDark) {
    // Sempre aplica --q-* da paleta escura (ou light como fallback para Vue/Quasar)
    const darkFlat = darkInput ? normalizeColorInput(darkInput) : {};
    const hasDark = Object.values(darkFlat).some((v) => !!v);

    const qSource = hasDark ? darkFlat : flat;
    Object.entries(qSource).forEach(([key, value]) => {
      if (value) root.style.setProperty(`--q-${key}`, value);
    });

    if (hasDark) {
      // Paleta dark configurada: aplica shadcn vars com as cores escuras
      applyShadcnVars(darkFlat);
    }
    // Sem paleta dark: ja removemos overrides acima → globals.css .dark assume
    return;
  }

  // Modo claro: --q-* + variáveis shadcn convertidas para HSL
  Object.entries(flat).forEach(([key, value]) => {
    if (value) root.style.setProperty(`--q-${key}`, value);
  });
  applyShadcnVars(flat);
}
