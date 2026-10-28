"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * true quando a media query casa. No servidor e na hidratação devolve false (o primeiro
 * render é sempre o de tela pequena), então quem usa precisa aceitar a troca logo depois.
 * Mesma implementação do editor de e-mail (`email-marketing/visual/editor-shared.ts`).
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
      const mql = window.matchMedia(query);
      if (typeof mql.addEventListener === "function") {
        mql.addEventListener("change", onChange);
        return () => mql.removeEventListener("change", onChange);
      }
      mql.addListener?.(onChange);
      return () => mql.removeListener?.(onChange);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches,
    () => false
  );
}
