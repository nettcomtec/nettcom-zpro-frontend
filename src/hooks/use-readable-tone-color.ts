"use client";

import { useEffect, useState } from "react";
import { blendHex, hslToHex, parseHslVar, readableHslOnSurface } from "@/lib/color-contrast";

/**
 * Controle de luminância para texto/ícone de tom semântico sobre o próprio fundo
 * translúcido (ex.: `text-warning` dentro de um banner `bg-warning/10`).
 *
 * A cor crua do tom passa no tema escuro e falha no claro (âmbar sobre âmbar pálido
 * dá ~2:1 de contraste). Aqui a matiz/saturação da marca é preservada e só a
 * luminância é ajustada até bater `minRatio` de contraste WCAG contra a superfície
 * real do banner.
 *
 * Recalcula na troca de tema (classe `.dark` no <html>) e na reaplicação da paleta
 * whitelabel (inline style do :root — `applyBrandColors`).
 *
 * @param tone         nome da var CSS sem o "--" (ex.: "warning", "success")
 * @param surfaceAlpha opacidade do tom no fundo em que o texto assenta
 * @param minRatio     contraste mínimo desejado (4.5 = WCAG AA para texto normal)
 * @returns hex legível; `undefined` no SSR/primeiro paint (a classe CSS assume)
 */
export function useReadableToneColor(
  tone: string,
  surfaceAlpha = 0.1,
  minRatio = 4.5
): string | undefined {
  const [color, setColor] = useState<string>();

  useEffect(() => {
    const compute = () => {
      const style = getComputedStyle(document.documentElement);
      const toneHsl = parseHslVar(style.getPropertyValue(`--${tone}`));
      const bgHsl = parseHslVar(style.getPropertyValue("--background"));
      if (!toneHsl || !bgHsl) { setColor(undefined); return; }

      const surface = blendHex(
        hslToHex(toneHsl.h, toneHsl.s, toneHsl.l),
        surfaceAlpha,
        hslToHex(bgHsl.h, bgHsl.s, bgHsl.l)
      );
      setColor(readableHslOnSurface(toneHsl, surface, minRatio));
    };

    compute();
    const obs = new MutationObserver(compute);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    return () => obs.disconnect();
  }, [tone, surfaceAlpha, minRatio]);

  return color;
}
