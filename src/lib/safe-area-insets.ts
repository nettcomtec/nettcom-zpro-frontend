"use client";

import { useSyncExternalStore } from "react";

/**
 * Faixas da tela que o sistema ocupa quando o painel desenha até a borda (`viewportFit:
 * "cover"` no app/layout.tsx): a barra de botões do Android no app (Capacitor 8 repassa os
 * insets à página), o indicador de início do iPhone e a barra de status.
 *
 * Os menus flutuantes do Radix (menu, Popover, Select) se posicionam pela janela inteira.
 * Sem este desconto o fim da lista caía por baixo dos botões do Android, que ficam com o
 * toque: o "Apagar" do menu da última mensagem não respondia. Os componentes base de
 * components/ui somam estas faixas ao `collisionPadding`; fora do app (computador) elas são
 * 0 e a posição fica idêntica à de antes.
 *
 * Lido por um elemento de medida com o maior entre `env(safe-area-inset-*)` e as variáveis
 * `--safe-area-inset-*` que o SystemBars do Capacitor grava na página (reserva para WebView
 * que não informa o `env()`), uma leitura só por mudança de tamanho da janela (rotação,
 * teclado), dividida por todos os menus montados.
 */
export type SafeAreaInsets = { top: number; right: number; bottom: number; left: number };

type Side = keyof SafeAreaInsets;

/** O mesmo formato do `collisionPadding` do Radix. */
export type CollisionPadding = number | Partial<Record<Side, number>>;

export const NO_SAFE_AREA_INSETS: SafeAreaInsets = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

const insetCss = (side: Side) => `max(env(safe-area-inset-${side},0px),var(--safe-area-inset-${side},0px))`;

const PROBE_STYLE =
  "position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
  `padding:${insetCss("top")} ${insetCss("right")} ${insetCss("bottom")} ${insetCss("left")}`;

let probe: HTMLDivElement | null = null;
let current: SafeAreaInsets = NO_SAFE_AREA_INSETS;
let measured = false;
const listeners = new Set<() => void>();

function px(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function sameSafeAreaInsets(a: SafeAreaInsets, b: SafeAreaInsets): boolean {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

/** Faixas atuais, em px de CSS. Sem janela, sem suporte a `env()` ou em erro: tudo 0. */
export function readSafeAreaInsets(): SafeAreaInsets {
  if (typeof window === "undefined" || typeof document === "undefined") return NO_SAFE_AREA_INSETS;
  try {
    if (!probe || !probe.isConnected) {
      const parent = document.body || document.documentElement;
      if (!parent) return NO_SAFE_AREA_INSETS;
      probe = document.createElement("div");
      probe.setAttribute("aria-hidden", "true");
      probe.setAttribute("data-zpro-safe-area-probe", "");
      probe.style.cssText = PROBE_STYLE;
      parent.appendChild(probe);
    }
    const style = window.getComputedStyle(probe);
    const next = {
      top: px(style.paddingTop),
      right: px(style.paddingRight),
      bottom: px(style.paddingBottom),
      left: px(style.paddingLeft),
    };
    return sameSafeAreaInsets(next, NO_SAFE_AREA_INSETS) ? NO_SAFE_AREA_INSETS : next;
  } catch {
    return NO_SAFE_AREA_INSETS;
  }
}

/**
 * Soma as faixas ao `collisionPadding` pedido pela tela (a distância pedida passa a contar
 * da borda visível). Sem faixa nenhuma devolve o valor recebido, sem tocar.
 */
export function withSafeAreaPadding(
  padding: CollisionPadding | undefined,
  insets: SafeAreaInsets
): CollisionPadding | undefined {
  if (sameSafeAreaInsets(insets, NO_SAFE_AREA_INSETS)) return padding;
  const base: Partial<Record<Side, number>> =
    typeof padding === "number"
      ? { top: padding, right: padding, bottom: padding, left: padding }
      : padding ?? {};
  const side = (key: Side) => {
    const value = base[key];
    return (typeof value === "number" && Number.isFinite(value) ? value : 0) + insets[key];
  };
  return { top: side("top"), right: side("right"), bottom: side("bottom"), left: side("left") };
}

function refresh() {
  const next = readSafeAreaInsets();
  measured = true;
  if (sameSafeAreaInsets(next, current)) return;
  current = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener("resize", refresh);
    window.addEventListener("orientationchange", refresh);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("resize", refresh);
      window.removeEventListener("orientationchange", refresh);
      // Sem nenhum menu montado ninguém ouve a janela: o próximo lê de novo.
      measured = false;
    }
  };
}

function getSnapshot(): SafeAreaInsets {
  if (!measured) {
    current = readSafeAreaInsets();
    measured = true;
  }
  return current;
}

function getServerSnapshot(): SafeAreaInsets {
  return NO_SAFE_AREA_INSETS;
}

export function useSafeAreaInsets(): SafeAreaInsets {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** `collisionPadding` do menu já com as faixas do sistema. */
export function useSafeAreaCollisionPadding(padding?: CollisionPadding): CollisionPadding | undefined {
  return withSafeAreaPadding(padding, useSafeAreaInsets());
}
