"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface SectionNavItem {
  /** id da secao; o pai garante que existe um elemento com id={`section-${key}`} */
  key: string;
  label: string;
  /** ex.: "4/13" — ja formatado. Omitido = sem badge. */
  countLabel?: string;
}

export interface SettingsSectionNavProps {
  items: SectionNavItem[];
  /** chamado ao clicar num item; o pai abre a secao (se fechada) e rola ate ela */
  onSelect: (key: string) => void;
  /** rotulo do bloco, ex.: "Nesta pagina" */
  title?: string;
}

const SECTION_ID_PREFIX = "section-";

export function SettingsSectionNav({ items, onSelect, title }: SettingsSectionNavProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const chipsScrollRef = useRef<HTMLDivElement | null>(null);
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Assinatura estavel das chaves: o pai normalmente recria o array `items` a
  // cada render, e depender dele direto reconstruiria o observer sem parar.
  const itemsSignature = items.map((item) => item.key).join("|");

  useEffect(() => {
    const keys = itemsSignature ? itemsSignature.split("|") : [];
    if (keys.length === 0) return;

    let observer: IntersectionObserver | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const visible = new Set<string>();

    const attach = () => {
      const targets = keys
        .map((key) => document.getElementById(`${SECTION_ID_PREFIX}${key}`))
        .filter((el): el is HTMLElement => el !== null);

      // Secoes ainda nao montadas (pagina em loading/skeleton): tenta de novo por
      // alguns ciclos e desiste em silencio. A nav continua clicavel, so sem realce.
      if (targets.length === 0) {
        if (attempts++ < 20) retryTimer = setTimeout(attach, 250);
        return;
      }

      // O container de scroll do dashboard NAO e a window: o conteudo rola dentro
      // do elemento #main-scroll. Passar esse elemento como `root` e obrigatorio —
      // com o root padrao (viewport) o observer nunca dispararia aqui. O fallback
      // `null` mantem o comportamento de viewport caso o layout mude.
      const root = document.getElementById("main-scroll");

      observer = new IntersectionObserver(
        (observed) => {
          for (const entry of observed) {
            const key = entry.target.id.slice(SECTION_ID_PREFIX.length);
            if (entry.isIntersecting) visible.add(key);
            else visible.delete(key);
          }
          // Ativa a primeira secao (na ordem da lista) dentro da faixa de leitura.
          // Se nenhuma estiver na faixa, mantem a ultima ativa para nao piscar.
          const next = keys.find((key) => visible.has(key));
          if (next) setActiveKey(next);
        },
        // Faixa que marca como ativa a secao cujo topo ja passou do terco superior.
        { root: root ?? null, rootMargin: "-15% 0px -70% 0px", threshold: 0 }
      );

      for (const target of targets) observer.observe(target);
    };

    attach();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      observer?.disconnect();
    };
  }, [itemsSignature]);

  // Mantem o chip ativo visivel no mobile sem mexer no scroll vertical da pagina.
  useEffect(() => {
    if (!activeKey) return;
    const container = chipsScrollRef.current;
    const chip = chipRefs.current[activeKey];
    if (!container || !chip) return;
    const containerRect = container.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    const delta = chipRect.left - containerRect.left - (containerRect.width - chipRect.width) / 2;
    container.scrollBy({ left: delta, behavior: "smooth" });
  }, [activeKey]);

  if (items.length === 0) return null;

  return (
    <>
      {/* Desktop: indice vertical fixo ao lado do conteudo */}
      <nav className="hidden w-[180px] shrink-0 lg:block">
        <div className="sticky top-4 space-y-1">
          {title && (
            <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {title}
            </p>
          )}
          {items.map((item) => {
            const active = item.key === activeKey;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelect(item.key)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 border-l-2 py-1.5 pl-3 pr-2 text-left text-sm transition-colors duration-150",
                  active
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                )}
              >
                <span className="min-w-0 flex-1 truncate" title={item.label}>
                  {item.label}
                </span>
                {item.countLabel && (
                  <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    {item.countLabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Mobile/tablet: chips com scroll horizontal (mesmo padrao do layout de configuracoes) */}
      <div
        ref={chipsScrollRef}
        className={cn(
          "sticky top-0 z-20 -mx-3 overflow-x-auto scrollbar-none border-b border-border px-3 py-2 lg:hidden",
          "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        )}
      >
        <nav className="flex w-max gap-1.5">
          {items.map((item) => {
            const active = item.key === activeKey;
            return (
              <button
                key={item.key}
                type="button"
                ref={(el) => {
                  chipRefs.current[item.key] = el;
                }}
                onClick={() => onSelect(item.key)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs transition-colors",
                  active
                    ? "bg-primary font-medium text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {item.label}
                {item.countLabel && (
                  <span
                    className={cn(
                      "text-[10px] tabular-nums",
                      active ? "text-primary-foreground/80" : "text-muted-foreground"
                    )}
                  >
                    {item.countLabel}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}

export default SettingsSectionNav;
