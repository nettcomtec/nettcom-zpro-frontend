"use client";

// Ficha da oportunidade (PLANO_FUNIL_OPORTUNIDADES_KOMMO 5.3, D5-D8, D16): painel lateral
// com os dados à esquerda e a conversa do contato (só leitura) à direita; no celular, abas
// em tela cheia. Os diálogos de atendimento e do Google Agenda são do page (montados uma
// vez, fora da ficha): aqui só chegam o fluxo e a instância do hook.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Info, Loader2, Lock, Mail, MessageCircle, MessagesSquare, MoreHorizontal, Pencil,
  Phone, RotateCcw, Trash2, Trophy, User, UserRound, X, XCircle,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ContactAvatar } from "@/components/contact-avatar";
import { ContactCrmCard } from "@/components/contact-crm/contact-crm-card";
import { ContactTimeline } from "@/components/contact-crm/contact-timeline";
import { useSpyMessages, SpyMessagesPanel } from "@/components/atendimento/spy-contact-messages-dialog";
import { OpportunityFormBody } from "@/components/funil/opportunity-form-fields";
import type { useOpportunityCalendarEvent } from "@/components/funil/opportunity-calendar-event";
import {
  OpportunityTicketBadge,
  type OpportunityTicketFlow,
} from "@/components/funil/opportunity-ticket-flow";
import {
  formatDateUTC,
  formatValue,
  mergeOpportunity,
  restrictedContactName,
  statusColor,
  statusLabel,
  type Opportunity,
  type Pipeline,
  type Responsible,
  type Stage,
} from "@/components/funil/opportunity-shared";
import { updateOpportunity, deleteOpportunity } from "@/services/funnel";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useRegion } from "@/hooks/use-region";
import { useLiveMode } from "@/hooks/use-live-mode";
import { useAuthStore } from "@/stores/auth-store";
import { displayContactIdentity } from "@/lib/contact-identity";
import { cn } from "@/lib/utils";

export interface OpportunitySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity: Opportunity | null;
  pipelines: Pipeline[];
  stages: Stage[];
  responsaveis: Responsible[];
  isRestricted: boolean;
  ticketFlow: OpportunityTicketFlow;
  gcal: ReturnType<typeof useOpportunityCalendarEvent>;
  onChanged: (opp: Opportunity) => void;
  onReloadList: () => void;
  onDeleted: (id: number) => void;
  onSendMessage?: (opp: Opportunity) => void;
  onSendEmail?: (opp: Opportunity) => void;
}

type SheetTab = "data" | "conversation" | "timeline";
type BusyAction = "stage" | "win" | "lose" | "open" | null;
type StatusAction = {
  key: "win" | "lose" | "open";
  label: string;
  hint: string;
  icon: React.ElementType;
  tone: string;
};

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border p-3 space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm font-medium break-words">{children}</div>
    </div>
  );
}

export function OpportunitySheet({
  open,
  onOpenChange,
  opportunity,
  pipelines,
  stages,
  responsaveis,
  isRestricted,
  ticketFlow,
  gcal,
  onChanged,
  onReloadList,
  onDeleted,
  onSendMessage,
  onSendEmail,
}: OpportunitySheetProps) {
  const t = useTranslations("funilKanbanPage");
  const tSheet = useTranslations("opportunitySheet");
  const tCrm = useTranslations("contactCrm");
  // Conversa escondida por "não ver atendimentos de outros": o vazio diz o motivo real
  const tChat = useTranslations("atendimentoChat");
  const router = useRouter();
  const { formatMoney } = useRegion();
  const { isLiveMode } = useLiveMode();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  // Mesmos gates que o summary do CRM usa para os filtros da linha do tempo, sem consulta extra
  const showCalls = useAuthStore((s) => s.isWavoipEnabled());
  const showRelationship = useAuthStore((s) => s.hasFeature("relationship"));
  // Perfil personalizado sem "criar atendimento" nem "envio em massa": o /individual recusa (D12)
  const canStartConversation = useAuthStore((s) => s.canStartConversation());

  // Cópia local: a resposta do PUT vem sem contato e a ficha segue mostrando o que já tinha
  const [current, setCurrent] = useState<Opportunity | null>(opportunity);
  const [editing, setEditing] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState<Opportunity | null>(null);
  const [tab, setTab] = useState<SheetTab>("data");
  const [busy, setBusy] = useState<BusyAction>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Prop nova do page substitui a cópia local; outra oportunidade (ou reabrir) volta aos dados
  const [syncedProp, setSyncedProp] = useState<Opportunity | null>(opportunity);
  const [syncedOpen, setSyncedOpen] = useState(open);
  if (opportunity !== syncedProp || open !== syncedOpen) {
    const idChanged = opportunity?.id !== syncedProp?.id;
    const reopened = open && !syncedOpen;
    if (opportunity !== syncedProp) setCurrent(opportunity);
    setSyncedProp(opportunity);
    setSyncedOpen(open);
    if (idChanged || reopened) {
      setEditing(false);
      setEditSnapshot(null);
      setTab("data");
      setConfirmDelete(false);
    }
  }

  const currentRef = useRef(current);
  currentRef.current = current;

  const contact = current?.contact ?? null;
  const contactId = contact?.id ?? current?.contactId ?? null;
  const hasContact = !!contactId;
  const canSeeContactExtras = hasContact && !isRestricted;

  // Conversa lida uma vez por abertura, na raiz: trocar de aba não refaz a busca (A2-8).
  // Erro nunca fecha a ficha; contato sem atendimento vira estado vazio, sem toast.
  const handleSpyError = useCallback(() => {}, []);
  const spyActive = open && hasContact;
  const spy = useSpyMessages(spyActive, contactId, handleSpyError, { silentNotFound: true });

  // O hook começa com loading=false: sem isto o estado vazio piscaria antes da 1ª busca
  const sawSpyLoadingRef = useRef(false);
  const [spySettledFor, setSpySettledFor] = useState<number | null>(null);
  useEffect(() => {
    sawSpyLoadingRef.current = spy.loading;
    if (!spyActive) setSpySettledFor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId, spyActive]);
  useEffect(() => {
    if (spy.loading) {
      sawSpyLoadingRef.current = true;
      return;
    }
    if (sawSpyLoadingRef.current && spyActive && contactId) {
      sawSpyLoadingRef.current = false;
      setSpySettledFor(contactId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spy.loading]);
  const conversationReady = spyActive && spySettledFor === contactId;
  const conversationLoading = spy.loading || !conversationReady;
  const conversationEmpty = !conversationLoading && (spy.notFound || spy.messages.length === 0);

  const pipelineStages = useMemo(() => {
    if (!current) return [] as Stage[];
    return stages
      .filter((s) => Number(s.pipelineId) === Number(current.pipelineId))
      .sort((a, b) => (Number(a.order ?? 0) - Number(b.order ?? 0)) || (Number(a.id) - Number(b.id)));
  }, [stages, current]);

  // Restrito (D16): o formulário de edição não pode mostrar nome inteiro, número nem e-mail
  // (o e-mail também iria para o convidado do evento do Google Agenda).
  const formOpportunity = useMemo(() => {
    if (!editSnapshot) return null;
    if (!isRestricted || !editSnapshot.contact) return editSnapshot;
    return {
      ...editSnapshot,
      contact: {
        ...editSnapshot.contact,
        name: restrictedContactName(editSnapshot.contact.name, true),
        number: undefined,
        email: undefined,
      },
    };
  }, [editSnapshot, isRestricted]);

  const applySaved = useCallback(
    (base: Opportunity, resp: Partial<Opportunity> | null | undefined) => {
      const latest = currentRef.current;
      const merged = mergeOpportunity(latest && latest.id === base.id ? latest : base, resp);
      if (latest && latest.id === base.id) setCurrent(merged);
      onChanged(merged);
      onReloadList();
      return merged;
    },
    [onChanged, onReloadList]
  );

  const persist = useCallback(
    async (data: Record<string, unknown>, action: Exclude<BusyAction, null>, successMsg: string) => {
      const base = currentRef.current;
      if (!base) return;
      setBusy(action);
      try {
        const res = await updateOpportunity(base.id, data);
        applySaved(base, (res?.data as Partial<Opportunity>) ?? null);
        toast.success(successMsg);
      } catch {
        toast.error(tSheet("saveError"));
      } finally {
        setBusy(null);
      }
    },
    [applySaved, tSheet]
  );

  const changeStage = useCallback(
    (value: string) => {
      const base = currentRef.current;
      if (!base) return;
      const stageId = Number(value);
      if (!stageId || stageId === Number(base.stageId)) return;
      void persist({ stageId, pipelineId: Number(base.pipelineId) }, "stage", tSheet("stageChanged"));
    },
    [persist, tSheet]
  );

  const changeStatus = useCallback(
    (status: "win" | "lose" | "open") => {
      void persist({ status }, status, tSheet("statusChanged"));
    },
    [persist, tSheet]
  );

  const startEdit = useCallback(() => {
    const base = currentRef.current;
    if (!base) return;
    // Retrato fixo: atualizações da ficha durante a edição não apagam o que foi digitado
    setEditSnapshot(base);
    setEditing(true);
    setTab("data");
  }, []);

  const stopEdit = useCallback(() => {
    setEditing(false);
    setEditSnapshot(null);
  }, []);

  const handleFormSaved = useCallback(
    (resp: Partial<Opportunity> | null) => {
      const base = editSnapshot ?? currentRef.current;
      if (base) applySaved(base, resp);
      stopEdit();
    },
    [applySaved, editSnapshot, stopEdit]
  );

  const handleDelete = useCallback(async () => {
    const base = currentRef.current;
    if (!base) return;
    setDeleting(true);
    try {
      await deleteOpportunity(base.id);
      toast.success(t("deleteSuccess"));
      setConfirmDelete(false);
      onDeleted(base.id);
    } catch {
      toast.error(t("deleteError"));
    } finally {
      setDeleting(false);
    }
  }, [onDeleted, t]);

  if (!current) return null;

  const opp = current;
  const pipeline = pipelines.find((p) => Number(p.id) === Number(opp.pipelineId));
  const stage = stages.find((s) => Number(s.id) === Number(opp.stageId));
  const responsavel = responsaveis.find((r) => String(r.value) === String(opp.responsibleId));
  const contactName = restrictedContactName(contact?.name, isRestricted);
  const contactIdentity = !isRestricted ? displayContactIdentity(contact) : "";
  const contactEmail = !isRestricted ? contact?.email : undefined;
  const canTimeline = canSeeContactExtras;

  const statusActions: StatusAction[] =
    opp.status === "open"
      ? [
          { key: "win", label: tSheet("markWon"), hint: tSheet("markWonHint"), icon: Trophy, tone: "text-green-600" },
          { key: "lose", label: tSheet("markLost"), hint: tSheet("markLostHint"), icon: XCircle, tone: "text-red-600" },
        ]
      : [{ key: "open", label: tSheet("reopen"), hint: tSheet("reopenHint"), icon: RotateCcw, tone: "" }];

  const showSendMessage = !isRestricted && canStartConversation && !!contact?.number && !!onSendMessage;
  const showSendEmail = !isRestricted && !!contact?.email && !!onSendEmail;
  const showProfile = canSeeContactExtras;

  const ticketBadge = (className?: string) =>
    contact ? (
      <OpportunityTicketBadge
        contact={contact}
        variant="sheet"
        onClick={() => ticketFlow.openFromOpportunity(opp)}
        canStart={ticketFlow.canStart(contact)}
        loading={ticketFlow.busyOpportunityId === opp.id}
        className={className}
      />
    ) : null;

  // ─── Cabeçalho ─────────────────────────────────────────────────────────────

  const moreMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          aria-label={t("moreActions")}
          title={t("moreActions")}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]" onClick={(e) => e.stopPropagation()}>
        {!isDesktop && (
          <>
            {statusActions.map((a) => {
              const Icon = a.icon;
              return (
                <DropdownMenuItem key={a.key} disabled={busy !== null || editing} onSelect={() => changeStatus(a.key)}>
                  <Icon className={a.tone} />
                  {a.label}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
          </>
        )}
        {showSendMessage && (
          <DropdownMenuItem onSelect={() => onSendMessage?.(opp)}>
            <MessageCircle />
            {t("sendMessage")}
          </DropdownMenuItem>
        )}
        {showSendEmail && (
          <DropdownMenuItem onSelect={() => onSendEmail?.(opp)}>
            <Mail />
            {t("sendEmail")}
          </DropdownMenuItem>
        )}
        {showProfile && (
          <DropdownMenuItem onSelect={() => router.push(`/contatos/${contactId}`)}>
            <UserRound />
            {tCrm("viewProfile")}
          </DropdownMenuItem>
        )}
        {(showSendMessage || showSendEmail || showProfile) && <DropdownMenuSeparator />}
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => setConfirmDelete(true)}
        >
          <Trash2 />
          {t("deleteAction")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const stageControl = (
    <div className="flex items-center gap-1.5 min-w-0 w-full sm:w-auto">
      <span className="text-xs text-muted-foreground shrink-0">{tSheet("stageLabel")}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label={tSheet("stageHint")}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{tSheet("stageHint")}</TooltipContent>
      </Tooltip>
      <Select
        value={opp.stageId ? String(opp.stageId) : ""}
        onValueChange={changeStage}
        // Durante a edição o formulário grava o retrato (etapa e status inclusive): mudar
        // aqui antes de salvar seria desfeito em silêncio pelo Salvar.
        disabled={busy !== null || editing || pipelineStages.length === 0}
      >
        <SelectTrigger className="h-8 flex-1 min-w-0 sm:w-[220px] sm:flex-none" aria-label={tSheet("stageLabel")}>
          <SelectValue placeholder={tSheet("stageLabel")} />
        </SelectTrigger>
        <SelectContent>
          {pipelineStages.map((s) => (
            <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {busy === "stage" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
    </div>
  );

  const header = (
    <div className="shrink-0 border-b px-4 py-3 pr-12 space-y-2.5">
      <div className="flex items-start gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold leading-snug break-words line-clamp-2">
            #{opp.id} - {opp.name}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={cn("inline-block px-2 py-0.5 rounded text-xs font-semibold", statusColor(opp.status))}>
              {statusLabel(opp.status, t)}
            </span>
            <span className="text-sm font-bold text-green-600">{formatValue(opp.value, formatMoney)}</span>
          </div>
        </div>
        {moreMenu}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {stageControl}
        {isDesktop &&
          statusActions.map((a) => {
            const Icon = a.icon;
            return (
              <Tooltip key={a.key}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy !== null || editing}
                    onClick={() => changeStatus(a.key)}
                  >
                    {busy === a.key ? <Loader2 className="animate-spin" /> : <Icon className={a.tone} />}
                    {a.label}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{a.hint}</TooltipContent>
              </Tooltip>
            );
          })}
        {contact && (
          <div className={cn("empty:hidden", isDesktop ? "ml-auto" : "w-full")}>
            {ticketBadge(isDesktop ? undefined : "w-full")}
          </div>
        )}
      </div>
    </div>
  );

  // ─── Coluna de dados ───────────────────────────────────────────────────────

  const dataView = (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("detailsTitle")}</h3>
        <Button type="button" variant="outline" size="sm" onClick={startEdit}>
          <Pencil />
          {t("edit")}
        </Button>
      </div>

      <InfoSection title={t("sectionBasic")}>
        <div className="grid grid-cols-2 gap-3">
          <InfoField label={t("fieldPipeline")}>{pipeline?.name ?? "—"}</InfoField>
          <InfoField label={t("fieldStage")}>{stage?.name ?? "—"}</InfoField>
          <InfoField label={t("fieldStatus")}>
            <span className={cn("inline-block px-2 py-0.5 rounded text-xs font-medium", statusColor(opp.status))}>
              {statusLabel(opp.status, t)}
            </span>
          </InfoField>
        </div>
      </InfoSection>

      <InfoSection title={t("sectionValues")}>
        <div className="grid grid-cols-2 gap-3">
          <InfoField label={t("fieldValue")}>
            <span className="text-green-600">{formatValue(opp.value, formatMoney)}</span>
          </InfoField>
          <InfoField label={t("fieldClosing")}>{formatDateUTC(opp.closingForecast) || "—"}</InfoField>
          <InfoField label={t("fieldCreated")}>{formatDateUTC(opp.createdAt) || "—"}</InfoField>
          <InfoField label={t("fieldUpdated")}>{formatDateUTC(opp.updatedAt) || "—"}</InfoField>
        </div>
      </InfoSection>

      <InfoSection title={t("sectionResponsible")}>
        <div className="flex items-center gap-2 text-sm">
          <User className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-medium">{responsavel?.label ?? t("noResponsible")}</span>
        </div>
      </InfoSection>

      <InfoSection title={t("sectionContact")}>
        {contact ? (
          <div className="flex items-center gap-3 min-w-0">
            <ContactAvatar
              name={contactName}
              profilePicUrl={contact.profilePicUrl}
              sizeClassName="w-10 h-10 shrink-0"
              fallbackClassName="bg-primary text-white font-bold"
              blur={isLiveMode}
            />
            <div className="min-w-0">
              <p className={cn("font-medium text-sm truncate", isLiveMode && "live-blur-text")}>{contactName}</p>
              {contactIdentity && (
                <div className={cn("flex items-center gap-1 text-xs text-muted-foreground min-w-0", isLiveMode && "live-blur-text")}>
                  <Phone className="h-3 w-3 shrink-0" />
                  <span className="truncate">{contactIdentity}</span>
                </div>
              )}
              {contactEmail && (
                <div className={cn("flex items-center gap-1 text-xs text-muted-foreground min-w-0", isLiveMode && "live-blur-text")}>
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate">{contactEmail}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{tSheet("noContact")}</p>
        )}
      </InfoSection>

      {opp.description && (
        <InfoSection title={t("sectionDescription")}>
          <p className="text-sm whitespace-pre-wrap break-words">{opp.description}</p>
        </InfoSection>
      )}
    </div>
  );

  const editView = (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t("edit")}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={stopEdit}>
          <X />
          {tSheet("cancelEdit")}
        </Button>
      </div>
      <OpportunityFormBody
        oportunidade={formOpportunity}
        pipelines={pipelines}
        stages={stages}
        responsaveis={responsaveis}
        onSaved={handleFormSaved}
        onCancel={stopEdit}
        showCalendarButton={gcal.hasActiveConfigs}
        calendarButtonLabel={gcal.labels.createEventButton}
        onRequestCalendarEvent={(d) => gcal.openEventDialog(d)}
      />
    </div>
  );

  const dataColumn = (
    <div className="space-y-4">
      {editing && formOpportunity ? editView : dataView}
      {canSeeContactExtras && contactId && <ContactCrmCard contactId={contactId} />}
    </div>
  );

  // ─── Conversa e linha do tempo ─────────────────────────────────────────────

  const conversation = !hasContact ? (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center">
      <MessagesSquare className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{tSheet("noContact")}</p>
    </div>
  ) : (
    <div className="flex-1 min-h-0 flex flex-col gap-2">
      {conversationEmpty ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center">
          <MessagesSquare className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {spy.hiddenActiveTicket ? tChat("noTicketAccess") : tSheet("noConversation")}
          </p>
          {ticketBadge()}
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col rounded-lg border overflow-hidden">
          <SpyMessagesPanel
            contactName={contactName}
            messages={spy.messages}
            loading={conversationLoading}
            loadingMore={spy.loadingMore}
            hasMore={spy.hasMore}
            onLoadPrevious={spy.loadPrevious}
            compact
          />
        </div>
      )}
      <div className="shrink-0 flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        <span>{tSheet("readOnlyHint")}</span>
      </div>
    </div>
  );

  const timeline = canTimeline && contactId ? (
    <ContactTimeline
      contactId={contactId}
      showFunnel
      showCalls={showCalls}
      showRelationship={showRelationship}
    />
  ) : null;

  // ─── Corpo: duas colunas (desktop) ou abas (celular) ───────────────────────

  const desktopRightTab: SheetTab = tab === "timeline" && canTimeline ? "timeline" : "conversation";
  const mobileTab: SheetTab = tab === "timeline" && !canTimeline ? "data" : tab;

  const body = isDesktop ? (
    <div className="flex-1 min-h-0 flex">
      <aside className="w-[380px] shrink-0 border-r overflow-y-auto p-4">{dataColumn}</aside>
      <section className="flex-1 min-w-0 min-h-0 flex flex-col p-4">
        <Tabs
          value={desktopRightTab}
          onValueChange={(v) => setTab(v as SheetTab)}
          className="flex-1 min-h-0 flex flex-col"
        >
          <TabsList className="self-start shrink-0">
            <TabsTrigger value="conversation">{tSheet("tabConversation")}</TabsTrigger>
            {canTimeline && <TabsTrigger value="timeline">{tSheet("tabTimeline")}</TabsTrigger>}
          </TabsList>
          <TabsContent value="conversation" className="mt-3 flex-1 min-h-0 flex flex-col data-[state=inactive]:hidden">
            {conversation}
          </TabsContent>
          {canTimeline && (
            <TabsContent value="timeline" className="mt-3 flex-1 min-h-0 overflow-y-auto data-[state=inactive]:hidden">
              {timeline}
            </TabsContent>
          )}
        </Tabs>
      </section>
    </div>
  ) : (
    <Tabs
      value={mobileTab}
      onValueChange={(v) => setTab(v as SheetTab)}
      className="flex-1 min-h-0 flex flex-col"
    >
      <TabsList className={cn("mx-4 mt-3 shrink-0 grid", canTimeline ? "grid-cols-3" : "grid-cols-2")}>
        <TabsTrigger value="data">{tSheet("tabData")}</TabsTrigger>
        <TabsTrigger value="conversation">{tSheet("tabConversation")}</TabsTrigger>
        {canTimeline && <TabsTrigger value="timeline">{tSheet("tabTimeline")}</TabsTrigger>}
      </TabsList>
      {/* Dados fica montado: ver a conversa no meio da edição não perde o que foi digitado */}
      <TabsContent
        value="data"
        forceMount
        className="mt-3 flex-1 min-h-0 overflow-y-auto px-4 pb-4 data-[state=inactive]:hidden"
      >
        {dataColumn}
      </TabsContent>
      <TabsContent value="conversation" className="mt-3 flex-1 min-h-0 flex flex-col px-4 pb-4 data-[state=inactive]:hidden">
        {conversation}
      </TabsContent>
      {canTimeline && (
        <TabsContent value="timeline" className="mt-3 flex-1 min-h-0 overflow-y-auto px-4 pb-4 data-[state=inactive]:hidden">
          {timeline}
        </TabsContent>
      )}
    </Tabs>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-5xl p-0 flex flex-col gap-0"
        aria-describedby={undefined}
      >
        <SheetTitle className="sr-only">{tSheet("srTitle")}</SheetTitle>
        <TooltipProvider delayDuration={300}>
          {header}
          {body}
        </TooltipProvider>

        <AlertDialog open={confirmDelete} onOpenChange={(v) => { if (!deleting) setConfirmDelete(v); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{tSheet("deleteConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{tSheet("deleteConfirmMsg", { name: opp.name })}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className={buttonVariants({ variant: "destructive" })}
                disabled={deleting}
                onClick={(e) => {
                  e.preventDefault();
                  void handleDelete();
                }}
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("deleteAction")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
