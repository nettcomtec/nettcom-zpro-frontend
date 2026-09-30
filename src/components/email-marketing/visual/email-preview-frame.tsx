"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { sanitizeEmailMarkup, useIsClient } from "./editor-shared";

export interface EmailPreviewFrameProps {
  /** HTML do corpo do e-mail (fragmento); o componente sanitiza e monta o documento */
  html: string;
  /** Largura da prévia em px (celular = MOBILE_PREVIEW_WIDTH); ausente = 100% */
  width?: number;
  className?: string;
}

const MIN_HEIGHT = 120;

/**
 * Prévia isolada do e-mail: iframe sem scripts (`sandbox="allow-same-origin"`, padrão do
 * render de e-mail recebido), HTML passado pelo DOMPurify e fundo sempre branco, como na
 * caixa do destinatário. Links saem com `<base target="_blank">` — no sandbox eles não
 * navegam dentro da prévia. A altura acompanha o conteúdo.
 */
export function EmailPreviewFrame({ html, width, className }: EmailPreviewFrameProps) {
  const t = useTranslations("emailMarketingPage");
  const isClient = useIsClient();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(MIN_HEIGHT);

  const srcDoc = useMemo(() => {
    const body = isClient ? sanitizeEmailMarkup(html) : "";
    return (
      '<!doctype html><html><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<base target="_blank"></head>' +
      `<body style="margin:0;background:#ffffff">${body}</body></html>`
    );
  }, [html, isClient]);

  const measure = useCallback(() => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!frame || !doc?.documentElement) return;
    // Encolhe antes de medir: com o iframe alto, scrollHeight nunca fica menor que ele
    // e a prévia não diminuiria quando o conteúdo encolhe (mesma tarefa = sem piscar)
    frame.style.height = `${MIN_HEIGHT}px`;
    // border-box: a borda do iframe (className do chamador) sai da altura útil — sem somá-la
    // o conteúdo fica 2px maior que a área visível e aparece barra de rolagem interna
    const frameChrome = Math.max(0, frame.offsetHeight - frame.clientHeight);
    const next = Math.max(MIN_HEIGHT, Math.ceil((doc.documentElement.scrollHeight || 0) + frameChrome));
    frame.style.height = `${next}px`;
    setHeight(next);
  }, []);

  // Computador ↔ celular muda a largura sem recarregar o documento (onLoad não dispara):
  // o texto quebra em outras linhas e a altura precisa ser medida de novo
  useEffect(() => {
    measure();
  }, [width, measure]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let timer: number | undefined;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, 150);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearTimeout(timer);
    };
  }, [measure]);

  return (
    <iframe
      ref={frameRef}
      title={t("preview")}
      sandbox="allow-same-origin"
      srcDoc={srcDoc}
      onLoad={measure}
      className={cn("block border-0 bg-white", className)}
      style={{ width: width ? `${width}px` : "100%", maxWidth: "100%", height: `${height}px` }}
    />
  );
}
