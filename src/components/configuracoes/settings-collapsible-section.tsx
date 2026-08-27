"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface SettingsCollapsibleSectionProps {
  /** id estável da seção — usado para montar o id do wrapper de conteúdo */
  sectionKey: string;
  title: string;
  description?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** rótulo já formatado e traduzido, ex.: "4 de 13 ativas". Omitido = sem badge. */
  countLabel?: string;
  children: React.ReactNode;
}

/**
 * Seção colapsável das configurações.
 *
 * REGRA CRÍTICA: o conteúdo NUNCA é desmontado — nada de `{open && ...}` aqui.
 * A página de configurações depende de `document.getElementById("row-<chave>")`
 * para a busca interna (scrollIntoView) e os admins usam o Ctrl+F nativo do
 * navegador. Se o conteúdo saísse do DOM quando fechado, a busca quebraria em
 * silêncio. Por isso também não usamos o Collapsible do Radix, que desmonta.
 *
 * Fechado, o conteúdo é escondido com `hidden="until-found"`: some da tela mas
 * continua no DOM, indexado pelo find-in-page. Quando o usuário acha um texto
 * escondido, o browser dispara `beforematch`, revela a seção sozinho e nós
 * sincronizamos o estado do React via `onOpenChange(true)`.
 */
export function SettingsCollapsibleSection({
  sectionKey,
  title,
  description,
  open,
  onOpenChange,
  countLabel,
  children,
}: SettingsCollapsibleSectionProps) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const headerId = `settings-section-${sectionKey}-header`;
  const contentId = `settings-section-${sectionKey}-content`;

  // Mantém a callback mais recente sem re-registrar o listener a cada render.
  const onOpenChangeRef = React.useRef(onOpenChange);
  React.useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  // React tipa `hidden` como boolean, então o valor "until-found" é aplicado
  // imperativamente. O `hidden={!open}` no JSX serve de estado inicial (SSR e
  // primeira pintura) para o conteúdo fechado não piscar antes deste efeito.
  React.useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    if (open) {
      el.removeAttribute("hidden");
      return;
    }

    // Sem suporte a `until-found` (Firefox/Safari), cai para o hidden normal:
    // o Ctrl+F não acha o texto escondido, mas o padrão da página é tudo
    // aberto, então ninguém perde comportamento que já tinha.
    const supportsUntilFound = "onbeforematch" in document.body;
    el.setAttribute("hidden", supportsUntilFound ? "until-found" : "");
  }, [open]);

  // Disparado pelo browser quando o find-in-page encontra texto escondido:
  // ele já revelou a seção, cabe ao React apenas acompanhar.
  React.useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const handleBeforeMatch = () => onOpenChangeRef.current(true);
    el.addEventListener("beforematch", handleBeforeMatch);
    return () => el.removeEventListener("beforematch", handleBeforeMatch);
  }, []);

  return (
    // O id externo é o alvo do scrollspy do índice lateral e do "ir para seção".
    <Card id={`section-${sectionKey}`}>
      {/* padding vai para o botão para a área clicável cobrir o header inteiro */}
      <CardHeader className="p-0">
        <button
          type="button"
          id={headerId}
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          aria-controls={contentId}
          className="flex w-full cursor-pointer items-center gap-3 rounded-t-xl p-6 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
        >
          <div className="flex min-w-0 flex-1 flex-col space-y-1.5">
            <CardTitle className="text-lg">{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {countLabel ? (
            <Badge variant="secondary" className="shrink-0 whitespace-nowrap">
              {countLabel}
            </Badge>
          ) : null}
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </button>
      </CardHeader>

      <CardContent
        ref={contentRef}
        id={contentId}
        role="region"
        aria-labelledby={headerId}
        hidden={!open}
        className="space-y-0"
      >
        {children}
      </CardContent>
    </Card>
  );
}

export default SettingsCollapsibleSection;
