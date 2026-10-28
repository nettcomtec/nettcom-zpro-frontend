"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { FormTheme } from "@/lib/forms";
import { buildFormThemeCss, type FormFrameMode } from "./form-theme";

/*
 * Moldura do formulário público: o <style> com escopo na raiz, o fundo da página e o
 * cartão. Usada pelo renderer (formulário) e pela página /f nos estados sem formulário
 * (carregando, indisponível, enviado), para tudo ter o mesmo visual.
 */
export interface PublicFormFrameProps {
  /** Já normalizado (normalizePublicFormTheme). */
  theme: FormTheme;
  mode: FormFrameMode;
  lang?: string;
  dir?: "ltr" | "rtl";
  /** false = sem cartão (só o "carregando"). */
  card?: boolean;
  /** Raiz do formulário (o PhoneInput monta a lista de países nela). */
  rootRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}

export function PublicFormFrame({ theme, mode, lang, dir, card = true, rootRef, children }: PublicFormFrameProps) {
  const rawId = React.useId();
  const scope = React.useMemo(() => `fr${rawId.replace(/[^A-Za-z0-9_-]/g, "")}`, [rawId]);
  const css = React.useMemo(() => buildFormThemeCss(scope, theme, mode), [scope, theme, mode]);

  const rootClass =
    mode === "page"
      ? "fr-page min-h-screen px-4 py-8 sm:py-12"
      : mode === "preview"
        ? "fr-page px-4 py-6 sm:px-6"
        : // Iframe: sem fundo e sem margem externa (o site de quem embute é o fundo).
          "";

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div ref={rootRef} data-form-root={scope} lang={lang} dir={dir} className={cn("relative", rootClass)}>
        <div className="fr-container">
          {card ? <div className={cn("fr-card", mode !== "embed" && "fr-card-shadow")}>{children}</div> : children}
        </div>
      </div>
    </>
  );
}

export default PublicFormFrame;
