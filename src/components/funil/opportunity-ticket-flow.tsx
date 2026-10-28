"use client";

// Abrir / iniciar atendimento a partir da oportunidade (PLANO_FUNIL_OPORTUNIDADES_KOMMO 5.2).
// O hook é montado UMA vez na página e os diálogos (`dialogs`) ficam fora de card e ficha:
// clique dentro de portal sobe pela árvore do React até o onClick do card (A2-1).

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, MessageSquarePlus, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  TicketAlreadyAssignedDialog, type TicketAssignedInfo,
} from "@/components/atendimento/ticket-already-assigned-dialog";
import {
  StartTicketDialog,
  getStartTicketConnections,
  getUsableStartTicketConnections,
  isStartTicketConnectionEligible,
  loadStartTicketWhatsapps,
  didStartTicketWhatsappsLoadFail,
} from "@/components/atendimento/start-ticket-dialog";
import {
  isBlockedByNotViewAssigned,
  restrictedContactName,
  type Opportunity,
  type OpportunityContact,
} from "@/components/funil/opportunity-shared";
import { fetchOpportunity } from "@/services/funnel";
import { useAuthStore } from "@/stores/auth-store";
import { useWhatsappStore } from "@/stores/whatsapp-store";

// ─── Fluxo ───────────────────────────────────────────────────────────────────

export interface OpportunityTicketFlow {
  openFromOpportunity: (opp: Opportunity) => void;
  canStart: (contact?: OpportunityContact | null) => boolean;
  dialogs: ReactNode;
  /** Oportunidade cujo clique está relendo o atendimento (spinner no botão) */
  busyOpportunityId: number | null;
}

export function useOpportunityTicketFlow(opts?: {
  onActiveTicketRefreshed?: (opportunityId: number, contact: OpportunityContact) => void;
}): OpportunityTicketFlow {
  const router = useRouter();
  const t = useTranslations("funilKanbanPage");
  const user = useAuthStore((s) => s.user);
  const supervisorAdmin = useAuthStore((s) => s.supervisorAdmin);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const isRestricted = useAuthStore((s) => s.isRestrictedUser());
  const whatsapps = useWhatsappStore((s) => s.whatsapps);
  // `hasPermission` só restringe o perfil custom, que é o que o POST /tickets recusa
  const canCreate = !!user && hasPermission("tickets_create");

  // Último callback da página, sem refazer o openFromOpportunity a cada render
  const refreshedRef = useRef(opts?.onActiveTicketRefreshed);
  useEffect(() => {
    refreshedRef.current = opts?.onActiveTicketRefreshed;
  });

  const [startOpen, setStartOpen] = useState(false);
  const [startContact, setStartContact] = useState<OpportunityContact | null>(null);
  const [assignedOpen, setAssignedOpen] = useState(false);
  const [assignedInfo, setAssignedInfo] = useState<TicketAssignedInfo | null>(null);
  // Um clique por vez: a releitura da oportunidade está no ar
  const busyRef = useRef(false);
  const [busyOpportunityId, setBusyOpportunityId] = useState<number | null>(null);

  // Store de canais vazia ao abrir o quadro direto: preenche uma vez para o botão
  // "Iniciar" já saber se há conexão (mesma requisição do quadro, dedup do serviço).
  // `channelsLoaded` separa "ainda não carregou" de "carregou e a empresa não tem conexão".
  const storeLoadRequestedRef = useRef(false);
  const [channelsLoaded, setChannelsLoaded] = useState(false);
  useEffect(() => {
    if (!canCreate || storeLoadRequestedRef.current) return;
    if (useWhatsappStore.getState().whatsapps.length > 0) {
      setChannelsLoaded(true);
      return;
    }
    storeLoadRequestedRef.current = true;
    let alive = true;
    void loadStartTicketWhatsapps().then(() => {
      if (alive && !didStartTicketWhatsappsLoadFail()) setChannelsLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [canCreate]);

  // Conexões do usuário calculadas uma vez; cada card só confere o tipo contra o contato
  const usableConnections = useMemo(
    () => getUsableStartTicketConnections(whatsapps, user, supervisorAdmin),
    [whatsapps, user, supervisorAdmin]
  );

  const canStart = useCallback(
    (contact?: OpportunityContact | null) => {
      if (!contact || contact.id == null) return false;
      if (!canCreate) return false;
      // Canais ainda não carregados: o botão aparece e o clique confere (aviso se não houver)
      if (whatsapps.length === 0) return !channelsLoaded;
      return usableConnections.some((w) => isStartTicketConnectionEligible(w, contact));
    },
    [canCreate, whatsapps.length, usableConnections, channelsLoaded]
  );

  const openFromOpportunity = useCallback(
    (opp: Opportunity) => {
      const baseContact = opp?.contact;
      if (!baseContact || baseContact.id == null) return;
      if (busyRef.current) return;
      busyRef.current = true;
      setBusyOpportunityId(opp.id);

      void (async () => {
        try {
          let contact: OpportunityContact = baseContact;
          // O selo do card não é tempo real: relê só esta oportunidade antes de decidir
          // (atendimento fechado, transferido ou aberto depois da carga). Falha = dado do card.
          try {
            const { data } = await fetchOpportunity(opp.id, { include: "activeTicket" });
            const fresh = data?.contact as OpportunityContact | null | undefined;
            if (fresh && typeof fresh === "object" && fresh.id != null) {
              // Mesmo contato: mantém o que só a lista traz (etiquetas, carteiras, foto...)
              contact = Number(fresh.id) === Number(baseContact.id) ? { ...baseContact, ...fresh } : fresh;
              refreshedRef.current?.(opp.id, contact);
            }
          } catch { /* fica com o dado do card */ }

          const auth = useAuthStore.getState();
          const me = auth.user;
          const active = contact.activeTicket;

          if (active) {
            const blocked = isBlockedByNotViewAssigned({
              notViewOn: auth.getConfigValue("NotViewAssignedTickets") === "enabled",
              profile: me?.profile,
              meId: me?.userId ?? null,
              ticketUserId: active.userId,
              viewerLinked: active.viewerLinked,
            });
            if (blocked) {
              setAssignedInfo({
                ticketId: active.id,
                contactName: restrictedContactName(contact.name, auth.isRestrictedUser()),
                assignedUserId: active.userId,
                assignedUserName: active.userName,
                assignedUserProfilePicture: active.userProfilePicture,
              });
              setAssignedOpen(true);
              return;
            }
            router.push(`/atendimento?ticketId=${active.id}`);
            return;
          }

          // Sem atendimento ativo (ou backend que não informa): iniciar
          if (!me || !auth.hasPermission("tickets_create")) return;
          const list = await loadStartTicketWhatsapps();
          if (getStartTicketConnections(contact, list, me, auth.supervisorAdmin).length === 0) {
            toast.warning(t("noChannelToStart"));
            return;
          }
          setStartContact(contact);
          setStartOpen(true);
        } finally {
          busyRef.current = false;
          setBusyOpportunityId(null);
        }
      })();
    },
    [router, t]
  );

  const dialogs = (
    <>
      <StartTicketDialog
        open={startOpen}
        onOpenChange={setStartOpen}
        contact={startContact}
        contactDisplayName={restrictedContactName(startContact?.name, isRestricted)}
      />
      <TicketAlreadyAssignedDialog open={assignedOpen} onOpenChange={setAssignedOpen} info={assignedInfo} />
    </>
  );

  return { openFromOpportunity, canStart, dialogs, busyOpportunityId };
}

// ─── Selo + botão (apresentação) ─────────────────────────────────────────────

export function OpportunityTicketBadge({
  contact,
  variant,
  onClick,
  canStart,
  className,
  loading = false,
}: {
  contact?: OpportunityContact | null;
  variant: "card" | "sheet";
  onClick: () => void;
  canStart: boolean;
  className?: string;
  /** Clique relendo o atendimento: spinner e botão travado */
  loading?: boolean;
}) {
  const t = useTranslations("funilKanbanPage");
  const meId = useAuthStore((s) => s.user?.userId ?? null);

  if (!contact) return null;
  const active = contact.activeTicket ?? null;
  // undefined = o backend não informou (versão antiga, desligado ou falha): não dá para
  // afirmar que não há atendimento. O texto fica neutro e o clique confere na hora.
  const unknown = contact.activeTicket === undefined;
  const showStart = !active && canStart;
  if (!active && !showStart) return null;

  const isSheet = variant === "sheet";

  // Selo (D1/D13): mostrado a todos, inclusive para atendimento de colega; nunca texto de mensagem
  let statusText = "";
  let dotClass = "";
  if (active) {
    if (active.status === "pending") {
      statusText = t("ticketPending");
      dotClass = "bg-amber-500";
    } else if (active.userId != null && meId != null && Number(active.userId) === Number(meId)) {
      statusText = t("ticketWithYou");
      dotClass = "bg-emerald-500";
    } else if (active.userId != null && active.userName) {
      statusText = t("ticketWithUser", { name: active.userName });
      dotClass = "bg-sky-500";
    } else {
      statusText = t("ticketInProgress");
      dotClass = "bg-indigo-500";
    }
  }
  const unread = Math.max(0, Number(active?.unreadMessages) || 0);
  const extraTickets = Math.max(0, (Number(contact.activeTicketCount) || 0) - 1);

  const ButtonIcon = loading ? Loader2 : active || unknown ? MessageSquareText : MessageSquarePlus;
  const buttonLabel = active || unknown ? t("openTicket") : t("startTicket");
  const buttonHint = active || unknown ? t("openTicketHint") : t("startTicketHint");

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    // O botão mora dentro do card clicável (abre a ficha) e arrastável
    e.stopPropagation();
    onClick();
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          isSheet
            ? "flex flex-wrap items-center gap-2"
            : "flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-border/60 pt-2",
          className
        )}
      >
        {active && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "inline-flex min-w-0 max-w-full items-center gap-1.5",
                  isSheet ? "text-sm" : "text-xs"
                )}
              >
                <span
                  aria-hidden
                  className={cn("shrink-0 rounded-full", isSheet ? "h-2.5 w-2.5" : "h-2 w-2", dotClass)}
                />
                <span className="min-w-0 truncate font-medium text-foreground">{statusText}</span>
                {unread > 0 && (
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-red-500 px-1.5 text-[10px] font-semibold leading-4 text-white">
                    {t("ticketUnread", { count: unread })}
                  </span>
                )}
                {extraTickets > 0 && (
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-muted px-1.5 text-[10px] font-semibold leading-4 text-muted-foreground">
                    {t("ticketMore", { count: extraTickets })}
                  </span>
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{t("ticketBadgeHint")}</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={isSheet ? "default" : active ? "secondary" : "outline"}
              size={isSheet ? "default" : "sm"}
              className={cn(
                "max-w-full",
                isSheet ? "w-full gap-1.5 sm:w-auto" : "ml-auto h-7 gap-1 px-2.5 text-xs"
              )}
              onClick={handleClick}
              disabled={loading}
              aria-busy={loading || undefined}
            >
              <ButtonIcon className={cn("shrink-0", isSheet ? "h-4 w-4" : "h-3.5 w-3.5", loading && "animate-spin")} />
              <span className="min-w-0 truncate">{buttonLabel}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{buttonHint}</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
