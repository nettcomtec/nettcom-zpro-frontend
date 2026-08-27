"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export interface UseUnsavedChangesGuardOptions {
  /** true quando há alterações pendentes */
  enabled: boolean;
  /** chamado quando um clique de navegação interna foi interceptado */
  onIntercept: (href: string) => void;
}

/**
 * Protege uma página contra saída acidental com alterações não salvas.
 *
 * Cobre dois caminhos de saída:
 *  1. reload / fechar aba  -> `beforeunload` (aviso nativo do navegador)
 *  2. navegação SPA (link) -> listener de clique em fase de CAPTURA no document
 *
 * POR QUE NÃO FAZEMOS MONKEY-PATCH DE `router.push` / `history.pushState`:
 * o App Router do Next 14 não expõe API oficial de bloqueio de navegação, e a
 * "solução" comum na internet é sobrescrever `router.push` ou o History API.
 * Isso é PROIBIDO aqui: são objetos globais compartilhados por toda a aplicação,
 * e se o patch não for revertido (unmount fora de ordem, erro no meio do render,
 * duas instâncias do hook montadas ao mesmo tempo, Fast Refresh) a navegação do
 * app inteiro quebra — não só desta página. Interceptar o clique é reversível por
 * construção: removeu o listener, o app volta exatamente ao comportamento nativo.
 *
 * POR QUE O LISTENER SÓ EXISTE ENQUANTO HÁ ALTERAÇÕES PENDENTES:
 * `enabled === false` não significa "listener passivo que deixa passar" — significa
 * NENHUM listener registrado. Enquanto o formulário está limpo, o custo e o risco
 * sobre a navegação global são exatamente zero. Não "simplifique" isso registrando
 * o listener uma vez e testando a flag lá dentro: o ponto é a janela de exposição
 * ser a menor possível.
 *
 * Regra de ouro em qualquer caso não coberto: NÃO interferir. Falhar para o lado
 * de deixar navegar, nunca para o lado de prender o usuário na página.
 */
export function useUnsavedChangesGuard({
  enabled,
  onIntercept,
}: UseUnsavedChangesGuardOptions): void {
  const pathname = usePathname();

  // Mantém o callback mais recente sem re-registrar o listener a cada render do pai.
  const onInterceptRef = useRef(onIntercept);
  useEffect(() => {
    onInterceptRef.current = onIntercept;
  }, [onIntercept]);

  // Aviso nativo do navegador (reload / fechar aba). Não cobre navegação SPA.
  useEffect(() => {
    if (!enabled) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [enabled]);

  // Intercepta cliques em links internos antes que o Next assuma a navegação.
  useEffect(() => {
    if (!enabled) return;

    const handleClick = (event: MouseEvent) => {
      // Outro handler já tratou o clique — respeitar a decisão dele.
      if (event.defaultPrevented) return;

      // Só botão principal do mouse; modificador = abrir em nova aba/janela/download.
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a");
      // SVGAElement e afins ficam de fora de propósito: não são navegação de app.
      if (!(anchor instanceof HTMLAnchorElement)) return;

      // `download` baixa o arquivo, não navega.
      if (anchor.hasAttribute("download")) return;

      // target="_blank" (ou qualquer frame nomeado) não tira o usuário desta página.
      const anchorTarget = anchor.getAttribute("target");
      if (anchorTarget && anchorTarget !== "_self") return;

      // Usar o atributo cru: `anchor.href` é resolvido e esconde "#", "mailto:", etc.
      const rawHref = anchor.getAttribute("href");
      if (!rawHref) return;
      if (rawHref.startsWith("#")) return;
      if (rawHref.startsWith("mailto:")) return;
      if (rawHref.startsWith("tel:")) return;

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.origin);
      } catch {
        // href malformado: não é problema nosso, deixar o navegador decidir.
        return;
      }

      // Qualquer protocolo fora de http(s) (javascript:, blob:, ftp:...) sai fora.
      if (url.protocol !== "http:" && url.protocol !== "https:") return;

      // Link externo: o próprio `beforeunload` acima já cobre esse caso.
      if (url.origin !== window.location.origin) return;

      // Mesma rota: navegar para onde já se está não perde nada.
      if (url.pathname === pathname) return;

      event.preventDefault();
      event.stopPropagation();
      onInterceptRef.current(`${url.pathname}${url.search}${url.hash}`);
    };

    // Captura: precisa rodar ANTES do handler do <Link> do Next, que escuta no bubble.
    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, [enabled, pathname]);
}
