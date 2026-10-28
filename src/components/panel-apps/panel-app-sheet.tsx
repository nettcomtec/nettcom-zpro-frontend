"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetDescription, SheetOverlay, SheetPortal, SheetTitle } from "@/components/ui/sheet";
import { PanelAppFrame } from "@/components/panel-apps/panel-app-frame";
import { openPanelAppLaunch, relaunchPanelAppSheet } from "@/lib/panel-app-launch";
import { cn } from "@/lib/utils";
import { useLiveModeStore } from "@/stores/live-mode-store";
import { useContextPanelApps, usePanelAppsStore, type PanelAppSheetState } from "@/stores/panel-apps-store";
import { useTicketStore } from "@/stores/ticket-store";

/**
 * Painel lateral da app aberta pelo contato ou pelo atendimento
 * (docs/PLANO_APLICATIVOS_PERSONALIZADOS_FASE2.md §5.7, D2, Ag2-13).
 *
 * - Montado UMA vez no layout do painel por `next/dynamic`, só enquanto há app aberta
 *   (`usePanelAppsStore().sheet`): quem não usa não baixa nem roda nada (Ag1-9).
 * - Por cima da tela, à direita, SEM desfoque (o chat/contato continua visível atrás) e em
 *   tela cheia abaixo de 640 px. Conteúdo próprio: o `SheetContent` desenha um X e usa
 *   `p-6`. A barra é a do `PanelAppFrame` ("Contato › Nome", Recarregar, Abrir em nova
 *   aba), com o Fechar no fim.
 * - Recarregar e Abrir em nova aba LANÇAM DE NOVO (ficha nova — a do iframe pode ter
 *   vencido): `relaunchPanelAppSheet` e `openPanelAppLaunch({ forceNewTab: true })`. O
 *   iframe recomeça a cada lançamento (`key` = `openedAt`).
 * - Fecha sozinho quando a página muda (link, menu, voltar/avançar do navegador), quando o
 *   atendimento aberto no /atendimento deixa de ser aquele em que a app foi aberta (outro
 *   atendimento, toque na notificação, encerrado), quando o modo apresentação é LIGADO
 *   (os dados do contato ficariam na tela) e quando a app sai da lista deste lugar. Esc e
 *   clique fora fecham (padrão do Radix); o Esc tratado aqui chega ao /atendimento com
 *   `defaultPrevented` e não desseleciona o atendimento.
 * - Com o painel aberto (modal), o resto da página não recebe clique — nem os avisos. Por
 *   isso a abertura em nova aba que termina no aviso com "Abrir" (janela recusada pelo
 *   navegador, iPhone/iPad no app) fecha o painel para o aviso poder ser tocado.
 */

const ATENDIMENTO_ROUTE = /^\/atendimento(\/|$)/;

const closePanelAppSheet = () => usePanelAppsStore.getState().closeSheet();

/** Clique/foco num aviso (toast) não conta como "fora do painel". */
const isToastTarget = (target: EventTarget | null): boolean => {
  const el = target as Element | null;
  if (!el || typeof el.closest !== "function") return false;
  return !!el.closest("[data-sonner-toaster], [data-sonner-toast]");
};

export function PanelAppSheet() {
  const sheet = usePanelAppsStore((s) => s.sheet);
  if (!sheet) return null;
  return <PanelAppSheetDialog sheet={sheet} />;
}

function PanelAppSheetDialog({ sheet }: { sheet: PanelAppSheetState }) {
  const t = useTranslations("panelAppLaunch");
  const tView = useTranslations("panelAppView");
  const tCommon = useTranslations("common");
  const pathname = usePathname();
  const currentTicketId = useTicketStore((s) => s.currentTicket?.id ?? null);
  const liveModeOn = useLiveModeStore((s) => s.envEnabled && s.active);

  // Página em que a app foi aberta: qualquer troca fecha (o componente só existe com a app aberta).
  const openedPathRef = useRef(pathname);
  useEffect(() => {
    if (pathname !== openedPathRef.current) closePanelAppSheet();
  }, [pathname]);

  // Voltar/avançar do navegador (ou do Android) fecha mesmo sem trocar de página.
  useEffect(() => {
    const onPopState = () => closePanelAppSheet();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // No /atendimento a app fica presa ao atendimento em que foi aberta: outro atendimento na
  // tela (clique na lista, toque na notificação, link do sino) ou nenhum (encerrado) fecha —
  // nunca a app de um cliente por cima da conversa de outro. Fora dele o atendimento do
  // store não é o da tela; ali vale a troca de página.
  const onTicketPage = ATENDIMENTO_ROUTE.test(openedPathRef.current || "");
  const boundTicketIdRef = useRef<number | null>(
    sheet.placement === "ticket" && typeof sheet.ticketId === "number" ? sheet.ticketId : currentTicketId
  );
  useEffect(() => {
    if (!onTicketPage) return;
    if (Number(currentTicketId) !== Number(boundTicketIdRef.current)) closePanelAppSheet();
  }, [onTicketPage, currentTicketId]);

  // Modo apresentação LIGADO com a app aberta: fecha (aberto já com ele ligado, os dados
  // foram mascarados no servidor e o painel fica).
  const liveModeRef = useRef(liveModeOn);
  useEffect(() => {
    if (liveModeOn && !liveModeRef.current) closePanelAppSheet();
    liveModeRef.current = liveModeOn;
  }, [liveModeOn]);

  // App que saiu da lista deste lugar (apagada, desativada, acesso retirado, lugar
  // desmarcado — chega pelo aviso de socket): fecha, como a página da app na v1 some.
  const { apps: contextApps, launchSupported } = useContextPanelApps(sheet.placement);
  const stillListed = contextApps.some((a) => a.id === sheet.app.id);
  useEffect(() => {
    if (launchSupported && !stillListed) closePanelAppSheet();
  }, [launchSupported, stillListed]);

  const contextLabel = sheet.placement === "ticket" ? t("sheet.contextTicket") : tCommon("contact");
  const description = sheet.placement === "ticket" ? t("sheet.descriptionTicket") : t("sheet.descriptionContact");
  // App com variáveis recebe os dados ao abrir; a sem variável abre o endereço gravado (v1).
  const extraHints = sheet.app.needsLaunch === true ? [tView("launchedHint"), tView("maskedHint")] : undefined;

  const reload = () => relaunchPanelAppSheet(t);

  // Chamado NO clique (a lib abre a janela vazia nele).
  const openOutside = () => {
    const appId = sheet.app.id;
    void openPanelAppLaunch({
      app: sheet.app,
      placement: sheet.placement,
      contactId: sheet.contactId,
      ticketId: sheet.ticketId,
      ticketIdHint: sheet.ticketIdHint,
      forceNewTab: true,
      t,
    }).then((result) => {
      if (result !== "pending") return;
      const current = usePanelAppsStore.getState().sheet;
      if (current && current.app.id === appId) closePanelAppSheet();
    });
  };

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) closePanelAppSheet();
      }}
    >
      <SheetPortal>
        <SheetOverlay className="bg-black/20 backdrop-blur-none" />
        <DialogPrimitive.Content
          onInteractOutside={(event) => {
            if (isToastTarget(event.target)) event.preventDefault();
          }}
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l bg-background p-0 shadow-xl outline-none",
            "sm:max-w-[min(1100px,90vw)]",
            "pt-[env(safe-area-inset-top)]",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=open]:duration-300"
          )}
        >
          <SheetTitle className="sr-only">{sheet.app.name}</SheetTitle>
          <SheetDescription className="sr-only">{description}</SheetDescription>
          <div className="relative min-h-0 flex-1">
            <PanelAppFrame
              key={sheet.openedAt}
              app={sheet.app}
              launchedUrl={sheet.url}
              onReload={reload}
              onOpenOutside={openOutside}
              contextLabel={contextLabel}
              extraHints={extraHints}
              barEnd={
                <>
                  <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />
                  <DialogPrimitive.Close asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground"
                      aria-label={tCommon("close")}
                      title={tCommon("close")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </DialogPrimitive.Close>
                </>
              }
            />
          </div>
        </DialogPrimitive.Content>
      </SheetPortal>
    </Sheet>
  );
}
