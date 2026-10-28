"use client";

import { useEffect } from "react";
import { FORM_EMBED_MESSAGE_RESIZE } from "@/lib/forms";

/*
 * Iframe do formulário (?embed=1): avisa a página-mãe da altura do conteúdo para o
 * código de embutir ajustar o iframe (lib/forms.ts, buildFormEmbedSnippet confere a
 * origem e o endereço). Mede o <html> (altura do conteúdo, não da janela: o iframe
 * também precisa encolher depois do envio).
 *
 * Um observador por documento: a página e o renderer podem pedir ao mesmo tempo (a
 * contagem evita mensagens em dobro). O envio sai por setTimeout, não por
 * requestAnimationFrame: o navegador congela o rAF de iframe de outra origem fora da
 * tela, e a 1ª altura precisa sair mesmo assim. Nada sai fora de iframe.
 */

let activeCount = 0;
let currentSlug = "";
let observer: ResizeObserver | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastHeight = -1;

function postHeight(): void {
  timer = null;
  try {
    if (typeof window === "undefined" || window.parent === window) return;
    const height = Math.ceil(document.documentElement.getBoundingClientRect().height);
    if (!height || height === lastHeight) return;
    lastHeight = height;
    window.parent.postMessage({ type: FORM_EMBED_MESSAGE_RESIZE, slug: currentSlug, height }, "*");
  } catch {
    // página-mãe inacessível: o iframe fica com a altura do código de embutir
  }
}

function schedule(): void {
  if (timer !== null) return;
  timer = setTimeout(postHeight, 32);
}

function start(): void {
  lastHeight = -1;
  try {
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(schedule);
      observer.observe(document.documentElement);
      if (document.body) observer.observe(document.body);
    }
    window.addEventListener("load", schedule);
  } catch {
    observer = null;
  }
}

function stop(): void {
  try {
    observer?.disconnect();
    window.removeEventListener("load", schedule);
  } catch {
    // nada a desfazer
  }
  observer = null;
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

export function useFormEmbedBridge(slug: string, enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    currentSlug = slug;
    activeCount += 1;
    if (activeCount === 1) start();
    schedule();
    return () => {
      activeCount = Math.max(0, activeCount - 1);
      if (activeCount === 0) stop();
    };
  }, [slug, enabled]);
}

export default useFormEmbedBridge;
