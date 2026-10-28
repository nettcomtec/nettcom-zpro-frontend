"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { create } from "zustand";
import { AppWindow, ExternalLink, EyeOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLiveMode } from "@/hooks/use-live-mode";
import { useMediaQuery } from "@/hooks/use-media-query";
import { openPanelAppLaunch, type PanelAppLaunchTranslator } from "@/lib/panel-app-launch";
import { getPanelAppIcon, type PanelAppNavEntry, type PanelAppPlacement } from "@/lib/panel-apps";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useContextPanelApps } from "@/stores/panel-apps-store";

/**
 * "Abrir em..." do contato e do atendimento (docs/PLANO_APLICATIVOS_PERSONALIZADOS_FASE2.md
 * §5.8; D1, D2, D7, D8).
 *
 * - Lista = `useContextPanelApps(placement)`: só apps da empresa com o lugar marcado e com a
 *   fase 2 ligada no servidor. Lista vazia (backend antigo, fase desligada, empresa sem app
 *   para o contato/atendimento) = nada aparece. Nenhuma chamada ao servidor para desenhar.
 * - O clique chama `openPanelAppLaunch` DIRETO no handler, sem `await` antes: a app "nova
 *   aba" abre a janela vazia ali mesmo (depois de um `await` o navegador bloquearia).
 * - Só ids vão ao servidor: contato → `contactId`; atendimento → `ticketId` (o servidor lê o
 *   contato pelo atendimento). Nunca o objeto do atendimento do store (tem tokens do canal).
 * - O botão abre sempre um menu, mesmo com UMA app: o nome da app e o aviso de dados aparecem
 *   ANTES de qualquer dado sair do painel, e isso funciona no toque (no celular não há
 *   tooltip). Clique direto numa linha da lista mandaria dados sem a pessoa ver para onde.
 * - "Abrindo...": marca por app + contexto num store deste módulo (o conteúdo do menu
 *   desmonta ao fechar); clique repetido não lança de novo.
 * - Restrito (D7) e modo apresentação (D8) só ganham o aviso: quem tira os dados é o
 *   servidor (a lib manda o modo apresentação junto).
 */

type ContextPlacement = Exclude<PanelAppPlacement, "menu">;
type MaskReason = "live" | "restricted" | null;

interface ContextIds {
  contactId?: number;
  ticketId?: number;
  /** Só no contato: atendimento pelo qual a tela chegou a ele (o servidor só usa para liberar). */
  ticketIdHint?: number;
}

/** No menu ⋯ o menu fecha ao escolher a app: se a abertura demorar, um aviso "Abrindo...". */
const OPENING_NOTICE_DELAY_MS = 600;

/** Mesma largura do `sm` do Tailwind: abaixo disso o submenu ao lado não cabe na tela. */
const SUBMENU_MIN_WIDTH_QUERY = "(min-width: 640px)";

// ── Aberturas em andamento (fora do componente: o menu desmonta ao fechar) ──

interface OpeningState {
  /** `${appId}@${contexto}` das aberturas em andamento. */
  keys: Readonly<Record<string, true>>;
}

const useOpeningStore = create<OpeningState>(() => ({ keys: {} }));

function beginOpening(key: string): boolean {
  const { keys } = useOpeningStore.getState();
  if (keys[key]) return false;
  useOpeningStore.setState({ keys: { ...keys, [key]: true as const } });
  return true;
}

function endOpening(key: string): void {
  const { keys } = useOpeningStore.getState();
  if (!keys[key]) return;
  const next: Record<string, true> = { ...keys };
  delete next[key];
  useOpeningStore.setState({ keys: next });
}

function isContextOpening(keys: Readonly<Record<string, true>>, ctx: string): boolean {
  const suffix = `@${ctx}`;
  return Object.keys(keys).some((k) => k.endsWith(suffix));
}

// ── Contexto (só ids) ─────────────────────────────────────────────────────

const toPositiveInt = (value: unknown): number | null => {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : null;
};

/** Contato → `contactId` (+ dica do atendimento); atendimento → só `ticketId`. Id inválido = sem ação. */
function contextIdsOf(
  placement: ContextPlacement,
  contactId?: number,
  ticketId?: number,
  ticketIdHint?: number | null
): ContextIds | null {
  if (placement === "contact") {
    const id = toPositiveInt(contactId);
    if (!id) return null;
    const hint = toPositiveInt(ticketIdHint);
    return hint ? { contactId: id, ticketIdHint: hint } : { contactId: id };
  }
  const id = toPositiveInt(ticketId);
  return id ? { ticketId: id } : null;
}

const contextKeyOf = (placement: ContextPlacement, ids: ContextIds): string =>
  placement === "contact" ? `contact:${ids.contactId}` : `ticket:${ids.ticketId}`;

/** Restrito (D7) ou modo apresentação (D8) agora: do cliente só vão os códigos internos. */
function useMaskReason(): MaskReason {
  const { isLiveMode } = useLiveMode();
  const restricted = useAuthStore((s) => s.user?.restrictedUser === true || s.user?.restrictedUser === "enabled");
  if (isLiveMode) return "live";
  return restricted ? "restricted" : null;
}

// ── Abertura ──────────────────────────────────────────────────────────────

function launchContextApp(
  app: PanelAppNavEntry,
  placement: ContextPlacement,
  ids: ContextIds,
  t: PanelAppLaunchTranslator,
  noticeWhenSlow: boolean
): void {
  const key = `${app.id}@${contextKeyOf(placement, ids)}`;
  if (!beginOpening(key)) return;
  // Sem await antes desta chamada: a lib abre a janela da app "nova aba" no próprio clique.
  const pending = openPanelAppLaunch({
    app,
    placement,
    contactId: placement === "contact" ? ids.contactId : undefined,
    ticketId: placement === "ticket" ? ids.ticketId : undefined,
    ticketIdHint: placement === "contact" ? ids.ticketIdHint : undefined,
    t,
  });
  let toastId: string | number | null = null;
  const timer = noticeWhenSlow
    ? setTimeout(() => {
        toastId = toast.loading(t("menu.openingApp", { name: app.name }));
      }, OPENING_NOTICE_DELAY_MS)
    : null;
  const done = () => {
    if (timer) clearTimeout(timer);
    if (toastId !== null) toast.dismiss(toastId);
    endOpening(key);
  };
  void pending.then(done, done);
}

// ── Peças do menu ─────────────────────────────────────────────────────────

/**
 * Topo do menu: o que a ação faz e o aviso de dados (ou o aviso de "só códigos" agora).
 * `compact` (menu ⋯ no celular): letra menor, com o MESMO aviso de dados — a pessoa vê para
 * onde os dados vão antes de qualquer dado sair do painel (decisão do Pedro, 21/10/2026).
 */
function PanelAppOpenMenuHeader({
  t,
  showTitle,
  compact = false,
}: {
  t: PanelAppLaunchTranslator;
  showTitle: boolean;
  compact?: boolean;
}) {
  const mask = useMaskReason();
  return (
    <div className="space-y-1.5 px-2 py-1.5">
      {showTitle && <p className="text-sm font-semibold">{t("menu.title")}</p>}
      <p className={cn("leading-snug", compact ? "text-[11px] text-muted-foreground" : "text-xs")}>{t("menu.help")}</p>
      {mask ? (
        <p className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-700 dark:text-amber-300">
          <EyeOff className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>{mask === "live" ? t("menu.maskedLive") : t("menu.maskedRestricted")}</span>
        </p>
      ) : (
        <div className="space-y-1 text-[11px] leading-snug text-muted-foreground">
          <p>{t("menu.dataNotice")}</p>
          <p>{t("menu.maskedNotice")}</p>
        </div>
      )}
    </div>
  );
}

/** Texto do tooltip do botão (montado só com o tooltip aberto). */
function PanelAppOpenTooltipBody({ t, busy }: { t: PanelAppLaunchTranslator; busy: boolean }) {
  const mask = useMaskReason();
  if (busy) return <p>{t("menu.opening")}</p>;
  return (
    <>
      <p className="font-medium">{t("menu.title")}</p>
      <p>{t("menu.help")}</p>
      {mask ? (
        <p>{mask === "live" ? t("menu.maskedLive") : t("menu.maskedRestricted")}</p>
      ) : (
        <>
          <p>{t("menu.dataNotice")}</p>
          <p>{t("menu.maskedNotice")}</p>
        </>
      )}
    </>
  );
}

function PanelAppOpenItems({
  apps,
  placement,
  ids,
  t,
  noticeWhenSlow,
}: {
  apps: PanelAppNavEntry[];
  placement: ContextPlacement;
  ids: ContextIds;
  t: PanelAppLaunchTranslator;
  noticeWhenSlow: boolean;
}) {
  const keys = useOpeningStore((s) => s.keys);
  const ctx = contextKeyOf(placement, ids);
  return (
    <>
      {apps.map((app) => {
        const Icon = getPanelAppIcon(app.icon);
        const opening = keys[`${app.id}@${ctx}`] === true;
        return (
          <DropdownMenuItem
            key={app.id}
            disabled={opening}
            title={app.name}
            onSelect={() => launchContextApp(app, placement, ids, t, noticeWhenSlow)}
          >
            {opening ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Icon aria-hidden="true" />}
            <span className="min-w-0 flex-1 truncate">
              {opening ? t("menu.openingApp", { name: app.name }) : app.name}
            </span>
            {app.openMode === "new_tab" && (
              <span className="ml-auto flex shrink-0 items-center text-muted-foreground" title={t("menu.opensInNewTab")}>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">{t("menu.opensInNewTab")}</span>
              </span>
            )}
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

// ── Botão com ícone (linha da lista e cabeçalho do perfil do contato) ──────

export interface PanelAppOpenButtonProps {
  placement: ContextPlacement;
  contactId?: number;
  ticketId?: number;
  /** Perfil do contato aberto a partir de um atendimento (`?ticketId=`): vai como dica. */
  ticketIdHint?: number | null;
  /** `icon` = só o ícone (linha da lista); `sm` = ícone + "Abrir em..." (cabeçalho). */
  size?: "icon" | "sm";
  className?: string;
  /**
   * Lista pronta de `useContextPanelApps(placement).apps`, para a página assinar o store UMA
   * vez (lista de contatos). Sem ela o botão lê o store sozinho.
   */
  apps?: PanelAppNavEntry[];
}

export function PanelAppOpenButton(props: PanelAppOpenButtonProps) {
  if (props.apps) {
    return props.apps.length > 0 ? <PanelAppOpenButtonView {...props} apps={props.apps} /> : null;
  }
  return <ConnectedPanelAppOpenButton {...props} />;
}

function ConnectedPanelAppOpenButton(props: PanelAppOpenButtonProps) {
  const { apps } = useContextPanelApps(props.placement);
  if (apps.length === 0) return null;
  return <PanelAppOpenButtonView {...props} apps={apps} />;
}

function PanelAppOpenButtonView({
  apps,
  placement,
  contactId,
  ticketId,
  ticketIdHint,
  size = "icon",
  className,
}: PanelAppOpenButtonProps & { apps: PanelAppNavEntry[] }) {
  const t = useTranslations("panelAppLaunch");
  const [open, setOpen] = useState(false);
  const ids = contextIdsOf(placement, contactId, ticketId, ticketIdHint);
  const ctx = ids ? contextKeyOf(placement, ids) : null;
  const busy = useOpeningStore((s) => (ctx ? isContextOpening(s.keys, ctx) : false));

  if (!ids || apps.length === 0) return null;

  const withText = size === "sm";
  const iconClass = withText ? "mr-2 h-4 w-4" : "h-3 w-3";
  return (
    <TooltipProvider delayDuration={300}>
      <DropdownMenu
        open={open}
        onOpenChange={(next) => {
          // Enquanto a app abre, o menu não reabre (clique repetido).
          if (next && busy) return;
          setOpen(next);
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant={withText ? "outline" : "ghost"}
                size={withText ? "sm" : "icon"}
                className={cn(!withText && "h-7 w-7", busy && "cursor-progress", className)}
                aria-label={withText ? undefined : t("menu.ariaLabel")}
                aria-busy={busy || undefined}
              >
                {busy ? (
                  <Loader2 className={cn(iconClass, "animate-spin")} aria-hidden="true" />
                ) : (
                  <AppWindow className={iconClass} aria-hidden="true" />
                )}
                {withText && (busy ? t("menu.opening") : t("menu.title"))}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          {!open && (
            <TooltipContent side="bottom" className="max-w-[280px] space-y-1 text-xs leading-snug">
              <PanelAppOpenTooltipBody t={t} busy={busy} />
            </TooltipContent>
          )}
        </Tooltip>
        <DropdownMenuContent
          align="end"
          collisionPadding={8}
          className="w-72 max-w-[calc(100vw-1rem)] max-h-[min(22rem,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto"
        >
          <PanelAppOpenMenuHeader t={t} showTitle />
          <DropdownMenuSeparator />
          <PanelAppOpenItems apps={apps} placement={placement} ids={ids} t={t} noticeWhenSlow={false} />
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}

// ── Dentro de outro menu (⋯ do cabeçalho do atendimento) ──────────────────

export interface PanelAppOpenMenuSubProps {
  placement: ContextPlacement;
  contactId?: number;
  ticketId?: number;
}

/**
 * Para dentro de um `DropdownMenuContent`. Tela larga: submenu "Abrir em..." › apps, com o
 * aviso completo no topo. Celular (abaixo de 640 px): as apps entram direto no menu, com o
 * topo compacto — o submenu abre AO LADO do menu; com o menu encostado na borda direita não
 * há espaço em nenhum dos lados, e o Radix só troca o lado, não o empurra para dentro da tela.
 */
export function PanelAppOpenMenuSub({ placement, contactId, ticketId }: PanelAppOpenMenuSubProps) {
  const t = useTranslations("panelAppLaunch");
  const { apps } = useContextPanelApps(placement);
  const wide = useMediaQuery(SUBMENU_MIN_WIDTH_QUERY);
  const ids = contextIdsOf(placement, contactId, ticketId);
  const ctx = ids ? contextKeyOf(placement, ids) : null;
  const busy = useOpeningStore((s) => (ctx ? isContextOpening(s.keys, ctx) : false));

  if (!ids || apps.length === 0) return null;

  if (!wide) {
    return (
      <DropdownMenuGroup>
        <DropdownMenuSeparator />
        <PanelAppOpenMenuHeader t={t} showTitle compact />
        <PanelAppOpenItems apps={apps} placement={placement} ids={ids} t={t} noticeWhenSlow />
      </DropdownMenuGroup>
    );
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger aria-busy={busy || undefined}>
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <AppWindow className="mr-2 h-4 w-4" aria-hidden="true" />
        )}
        {busy ? t("menu.opening") : t("menu.title")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        collisionPadding={8}
        className="w-72 max-w-[calc(100vw-2rem)] max-h-[min(22rem,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto"
      >
        <PanelAppOpenMenuHeader t={t} showTitle={false} />
        <DropdownMenuSeparator />
        <PanelAppOpenItems apps={apps} placement={placement} ids={ids} t={t} noticeWhenSlow />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
