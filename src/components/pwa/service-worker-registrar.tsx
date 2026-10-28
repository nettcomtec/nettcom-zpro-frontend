"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/*
 * Registro do service worker do painel (D24 do docs/PLANO_FORMULARIOS_ATENDIMENTO.md).
 *
 * Até aqui o @serwist/next registrava sozinho em TODA página (`register: true`): a
 * entrada dele cria `window.serwist` e chama `window.serwist.register()` (que espera o
 * `load` da janela). Agora o next.config.ts usa `register: false` e este componente faz
 * exatamente a mesma chamada, menos nas páginas públicas do visitante (/f e /agendar):
 * lá o service worker pré-carregaria o app inteiro do painel (~34 MB) e o navegador
 * ofereceria "instalar" o painel ao cliente final. Em dev o Serwist fica desligado e
 * `window.serwist` não existe: nada acontece, como antes.
 */

const isPublicVisitorPath = (pathname: string): boolean =>
  pathname === "/f" || pathname.startsWith("/f/") || pathname.startsWith("/agendar");

// Uma chamada por carregamento da página, como a entrada do Serwist fazia.
let registerCalled = false;

interface SerwistWindowLike {
  serwist?: { register?: () => unknown };
}

export function ServiceWorkerRegistrar() {
  const pathname = usePathname();

  useEffect(() => {
    if (registerCalled) return;
    try {
      const path = pathname || window.location.pathname || "/";
      if (isPublicVisitorPath(path)) return;
      const serwist = (window as unknown as SerwistWindowLike).serwist;
      if (!serwist || typeof serwist.register !== "function") return;
      registerCalled = true;
      const result = serwist.register();
      if (result && typeof (result as Promise<unknown>).catch === "function") {
        (result as Promise<unknown>).catch(() => {
          // falha de registro (navegador sem permissão, modo privado): o painel segue sem
          // service worker, como antes, só sem o erro solto no console
        });
      }
    } catch {
      // nunca derruba a página
    }
  }, [pathname]);

  return null;
}

export default ServiceWorkerRegistrar;
