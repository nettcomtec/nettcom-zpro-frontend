"use client";

// "Iniciar atendimento" compartilhado (PLANO_FUNIL_OPORTUNIDADES_KOMMO 5.2, D3): porte da
// cópia de /contatos com uma seleção única de conexão. Hoje só o funil usa; /contatos,
// /kanban/board e /kanban/tags seguem com as cópias deles (migração depois).

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { ExistingTicketDialog } from "@/components/atendimento/existing-ticket-dialog";
import {
  TicketAlreadyAssignedDialog, type TicketAssignedInfo,
} from "@/components/atendimento/ticket-already-assigned-dialog";
import { isBlockedByNotViewAssigned } from "@/components/funil/opportunity-shared";
import { findExistingOpenTicket, type ExistingOpenTicket } from "@/lib/check-existing-open-ticket";
import { filterWhatsappsByUserAccess } from "@/lib/whatsapp-user-access";
import { createTicket, updateTicket } from "@/services/tickets";
import { fetchQueues, type Queue } from "@/services/queues";
import { fetchAllUsers, type User } from "@/services/users";
import { fetchWhatsapps } from "@/services/whatsapp";
import { useAuthStore, type UserData } from "@/stores/auth-store";
import { useWhatsappStore, type WhatsApp } from "@/stores/whatsapp-store";

// ─── Conexões elegíveis ──────────────────────────────────────────────────────

// Porte literal de contatos/page.tsx (CHANNEL_TYPES): tipo fora desta lista não inicia
// atendimento por aqui (webchat, Mercado Livre, TikTok...).
const CHANNEL_TYPES = [
  { type: "whatsapp", label: "WhatsApp", logo: "whatsapp-logo.png" },
  { type: "baileys", label: "Baileys", logo: "baileys-logo.png" },
  { type: "zapo", label: "Zapo", logo: "zapo-logo.png" },
  { type: "meow", label: "Meow", logo: "meow-logo.png" },
  { type: "evo", label: "Evolution", logo: "evo-logo.png" },
  { type: "evogo", label: "Evolution Go", logo: "evogo-logo.png" },
  { type: "zapi", label: "Z-API", logo: "zapi-logo.png" },
  { type: "uazapi", label: "UAZAPI", logo: "uazapi-logo.png" },
  { type: "waba", label: "WABA", logo: "waba-logo.png" },
  { type: "gupshup", label: "Gupshup", logo: "gupshup-logo.png" },
  { type: "dialog360", label: "Dialog360", logo: "dialog360-logo.png" },
  { type: "messenger", label: "Messenger", logo: "messenger-logo.png" },
  { type: "instagram", label: "Instagram", logo: "instagram-logo.png" },
  { type: "hub_instagram", label: "Hub Instagram", logo: "hub_instagram-logo.png" },
  { type: "hub_facebook", label: "Hub Facebook", logo: "hub_facebook-logo.png" },
  { type: "hub_whatsapp_business_account", label: "Hub WBA", logo: "hub_whatsapp-logo.png" },
  { type: "telegram", label: "Telegram", logo: "telegram-logo.png" },
] as const;

// Canais que escrevem pelo telefone (exigem `contact.number`)
const NUMBER_CHANNEL_TYPES = [
  "whatsapp", "baileys", "zapo", "meow", "evo", "evogo", "zapi", "uazapi",
  "waba", "gupshup", "dialog360", "hub_whatsapp_business_account",
];

export interface StartTicketContact {
  id: number;
  number?: string | null;
  telegramId?: string | null;
  instagramPK?: string | null;
  messengerId?: string | null;
}

/** O que o filtro lê de cada conexão (serve à store e à resposta de `GET /whatsapp`). */
export interface StartTicketConnectionLike {
  id: number;
  name?: string;
  status?: string;
  type?: string;
  channel?: string;
  isDeleted?: boolean;
}

export function getStartTicketConnectionType(w: StartTicketConnectionLike | null | undefined): string {
  return String(w?.type || w?.channel || "");
}

function channelInfo(type: string) {
  return CHANNEL_TYPES.find((c) => c.type === type) ?? null;
}

function channelOrder(type: string): number {
  const idx = CHANNEL_TYPES.findIndex((c) => c.type === type);
  return idx < 0 ? CHANNEL_TYPES.length : idx;
}

/**
 * Conexões que o usuário pode usar, sem olhar o contato: conectadas, não excluídas, de
 * tipo conhecido e liberadas pela regra canônica de `whatsappAllowed`. Separada do
 * filtro por contato para o quadro calcular uma vez e conferir cada card barato.
 */
export function getUsableStartTicketConnections<T extends StartTicketConnectionLike>(
  whatsapps: T[],
  user: UserData | null | undefined,
  supervisorAdmin?: string | null
): T[] {
  const connected = (whatsapps || []).filter(
    (w) => w && w.status === "CONNECTED" && !w.isDeleted && channelInfo(getStartTicketConnectionType(w)) != null
  );
  // Sem o valor explícito vale o do store (nunca "liberar tudo" por omissão)
  const sa = supervisorAdmin ?? useAuthStore.getState().supervisorAdmin ?? "";
  return filterWhatsappsByUserAccess(connected, user, sa);
}

/** Regra por contato de `getContactChannelWhatsapps` (contatos/page.tsx), por tipo. */
export function isStartTicketConnectionEligible(
  w: StartTicketConnectionLike,
  contact: StartTicketContact | null | undefined
): boolean {
  if (!contact) return false;
  const type = getStartTicketConnectionType(w);
  if (NUMBER_CHANNEL_TYPES.includes(type)) return !!contact.number;
  if (type === "messenger") return !!contact.messengerId && !contact.number;
  if (type === "instagram") return !!contact.instagramPK && !contact.number;
  if (type === "hub_instagram") return !!contact.instagramPK;
  if (type === "hub_facebook") return !!contact.messengerId;
  // Bot do Telegram só escreve para quem já falou com ele: o id do chat
  // (telegramId) é gravado na primeira mensagem do contato.
  if (type === "telegram") return !!contact.telegramId;
  return channelInfo(type) != null;
}

/** Conexões em que dá para iniciar atendimento com o contato, na ordem dos tipos. */
export function getStartTicketConnections<T extends StartTicketConnectionLike>(
  contact: StartTicketContact | null | undefined,
  whatsapps: T[],
  user: UserData | null | undefined,
  supervisorAdmin?: string | null
): T[] {
  if (!contact) return [];
  return getUsableStartTicketConnections(whatsapps, user, supervisorAdmin)
    .filter((w) => isStartTicketConnectionEligible(w, contact))
    .sort((a, b) => {
      const byType = channelOrder(getStartTicketConnectionType(a)) - channelOrder(getStartTicketConnectionType(b));
      if (byType !== 0) return byType;
      return String(a.name ?? "").localeCompare(String(b.name ?? ""), undefined, { sensitivity: "base" });
    });
}

/**
 * Canais da store; vazia → `GET /whatsapp` (com cache/dedup do serviço) e grava na store,
 * como /contatos. Nunca lança: falha devolve lista vazia.
 */
// Última busca de canais falhou (rede/servidor): lista vazia aí não quer dizer "empresa sem
// conexão", e o botão "Iniciar" não pode sumir por isso.
let lastWhatsappsLoadFailed = false;
export function didStartTicketWhatsappsLoadFail(): boolean {
  return lastWhatsappsLoadFailed;
}

export async function loadStartTicketWhatsapps(): Promise<WhatsApp[]> {
  const current = useWhatsappStore.getState().whatsapps;
  if (current.length > 0) return current;
  try {
    const { data } = await fetchWhatsapps();
    lastWhatsappsLoadFailed = false;
    const all = (Array.isArray(data) ? data : []).filter((w) => !(w as { isDeleted?: boolean }).isDeleted);
    // Outra tela pode ter preenchido a store enquanto a busca corria: a dela vale
    const latest = useWhatsappStore.getState().whatsapps;
    if (latest.length > 0) return latest;
    if (all.length > 0) useWhatsappStore.getState().setWhatsapps(all);
    return all;
  } catch {
    lastWhatsappsLoadFailed = true;
    return [];
  }
}

// ─── Resposta 409 (atendimento já existe no mesmo canal) ─────────────────────

interface ConflictTicket {
  id: number;
  status: string;
  userId?: number | null;
  user?: { name?: string | null; profilePicture?: string | null } | null;
  whatsappId?: number | null;
}

function extract409Ticket(err: unknown): ConflictTicket | null {
  // O interceptor do axios rejeita com o próprio response (corpo em `data`)
  const e = err as { status?: number; data?: Record<string, unknown>; response?: { status?: number; data?: Record<string, unknown> } } | null;
  const status = e?.status ?? e?.response?.status;
  if (status !== 409) return null;
  const d = e?.data ?? e?.response?.data;
  if (!d) return null;
  if (d.ticket && typeof d.ticket === "object") return d.ticket as ConflictTicket;
  const raw = d.message ?? d.error;
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === "object" && "id" in parsed ? (parsed as ConflictTicket) : null;
  } catch {
    return null;
  }
}

// ─── Diálogo ─────────────────────────────────────────────────────────────────

export interface StartTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: StartTicketContact | null;
  /** Nome já tratado por quem chama (cortado para usuário restrito). Nunca o número. */
  contactDisplayName: string;
  onStarted?: (ticketId: number) => void;
}

export function StartTicketDialog({
  open,
  onOpenChange,
  contact,
  contactDisplayName,
  onStarted,
}: StartTicketDialogProps) {
  const tC = useTranslations("contatosPage");
  const tCommon = useTranslations("common");
  const tF = useTranslations("funilKanbanPage");
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const supervisorAdmin = useAuthStore((s) => s.supervisorAdmin);
  const getConfigValue = useAuthStore((s) => s.getConfigValue);
  const whatsapps = useWhatsappStore((s) => s.whatsapps);

  const [connectionId, setConnectionId] = useState<number | null>(null);
  const [queueId, setQueueId] = useState<number | null>(null);
  const [attendantId, setAttendantId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [channelsReady, setChannelsReady] = useState(() => useWhatsappStore.getState().whatsapps.length > 0);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const lookupsRequestedRef = useRef(false);

  // Desdobramentos do envio
  const [crossChannelTicket, setCrossChannelTicket] = useState<ExistingOpenTicket | null>(null);
  const [assignedOpen, setAssignedOpen] = useState(false);
  const [assignedInfo, setAssignedInfo] = useState<TicketAssignedInfo | null>(null);
  const [pendingTicket, setPendingTicket] = useState<ConflictTicket | null>(null);
  const [pendingOpen, setPendingOpen] = useState(false);

  const connections = useMemo(
    () => getStartTicketConnections(contact, whatsapps, user, supervisorAdmin),
    [contact, whatsapps, user, supervisorAdmin]
  );

  // Cada abertura começa do zero (o diálogo é único na página e troca de contato).
  // O "enviando" não é zerado aqui: quem cuida dele é o próprio envio.
  useEffect(() => {
    if (!open) return;
    setConnectionId(null);
    setQueueId(null);
    setAttendantId(null);
  }, [open, contact?.id]);

  // Uma conexão só já vem escolhida; a escolhida que deixa de ser elegível é solta
  useEffect(() => {
    if (!open) return;
    setConnectionId((cur) => {
      if (cur != null && connections.some((c) => c.id === cur)) return cur;
      return connections.length === 1 ? connections[0].id : null;
    });
  }, [open, connections]);

  // Store vazia (ninguém carregou os canais nesta sessão): busca e grava nela
  useEffect(() => {
    if (!open) return;
    if (useWhatsappStore.getState().whatsapps.length > 0) {
      setChannelsReady(true);
      return;
    }
    let alive = true;
    setChannelsReady(false);
    loadStartTicketWhatsapps().finally(() => {
      if (alive) setChannelsReady(true);
    });
    return () => { alive = false; };
  }, [open]);

  // Filas e atendentes: só ao abrir, uma vez por montagem (falha tenta de novo na próxima)
  useEffect(() => {
    if (!open || lookupsRequestedRef.current) return;
    lookupsRequestedRef.current = true;
    Promise.allSettled([fetchQueues(), fetchAllUsers()]).then(([q, u]) => {
      let failed = false;
      if (q.status === "fulfilled") setQueues(Array.isArray(q.value?.data) ? q.value.data : []);
      else failed = true;
      if (u.status === "fulfilled") {
        const list = Array.isArray(u.value?.data?.users) ? u.value.data.users : [];
        setUsers(list.filter((x) => x.profile !== "superadmin"));
      } else failed = true;
      if (failed) lookupsRequestedRef.current = false;
    });
  }, [open]);

  const selectedConnection = useMemo(
    () => connections.find((c) => c.id === connectionId) ?? null,
    [connections, connectionId]
  );
  const selectedType = getStartTicketConnectionType(selectedConnection);

  // Tipo mostrado na descrição: o da conexão escolhida; sem escolha, o único tipo possível
  const channelLabel = useMemo(() => {
    if (selectedConnection) return channelInfo(selectedType)?.label ?? selectedType;
    const types = Array.from(new Set(connections.map((c) => getStartTicketConnectionType(c))));
    if (types.length === 1) return channelInfo(types[0])?.label ?? types[0];
    return "-";
  }, [selectedConnection, selectedType, connections]);

  const connectionOptions: SearchableSelectOption[] = useMemo(
    () =>
      connections.map((w) => {
        const type = getStartTicketConnectionType(w);
        return { value: String(w.id), label: `${w.name ?? ""} · ${channelInfo(type)?.label ?? type}` };
      }),
    [connections]
  );
  const logoByValue = useMemo(() => {
    const m = new Map<string, string>();
    connections.forEach((w) => {
      const info = channelInfo(getStartTicketConnectionType(w));
      if (info) m.set(String(w.id), info.logo);
    });
    return m;
  }, [connections]);

  const queueOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: "none", label: tC("noQueue") },
      ...queues.filter((q) => q.isActive !== false).map((q) => ({ value: String(q.id), label: q.name })),
    ],
    [queues, tC]
  );

  // Com fila escolhida, só os atendentes dela (regra de /contatos)
  const attendantOptions: SearchableSelectOption[] = useMemo(
    () => [
      { value: "none", label: tC("noAttendant") },
      ...users
        .filter((u) => {
          if (!queueId) return true;
          return u.queues?.some((q) => q.id === queueId) ?? false;
        })
        .map((u) => ({ value: String(u.id), label: u.name })),
    ],
    [users, queueId, tC]
  );

  const notViewOn = getConfigValue("NotViewAssignedTickets") === "enabled";

  const goToTicket = (ticketId: number | string) => {
    router.push(`/atendimento?ticketId=${ticketId}`);
  };

  const handleConfirm = async (skipPrecheck = false) => {
    if (!contact || !connectionId || submittingRef.current) return;
    const connection =
      connections.find((c) => c.id === connectionId) ??
      whatsapps.find((w) => w.id === connectionId) ??
      null;
    const channel = getStartTicketConnectionType(connection);
    if (!channel) {
      toast.error(tC("errorCreatingTicket"));
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    const meId = user?.userId ?? null;
    const chosenUserId = attendantId ?? meId;

    try {
      // Pré-check cross-canal (flag do tenant): atendimento aberto/pendente do contato em
      // OUTRO canal avisa antes de criar (não bloqueia). O mesmo canal fica com o 409.
      if (!skipPrecheck && getConfigValue("crossChannelTicketCheck") === "enabled" && contact.number) {
        try {
          const cross = await findExistingOpenTicket({
            number: contact.number,
            whatsappId: connectionId,
            currentUserId: meId,
          });
          if (cross && cross.whatsappId != null && Number(cross.whatsappId) !== Number(connectionId)) {
            onOpenChange(false);
            // Nome que o diálogo mostra é o desta tela (cortado para restrito)
            setCrossChannelTicket({ ...cross, contactName: contactDisplayName });
            return;
          }
        } catch { /* pré-check nunca bloqueia a criação */ }
      }

      try {
        const payload: Record<string, unknown> = {
          contactId: contact.id,
          isActiveDemand: true,
          userId: chosenUserId,
          channel,
          channelId: connectionId,
          status: "open",
        };
        if (queueId) payload.queueId = queueId;
        const { data } = await createTicket(payload);
        const ticketId = data?.id || data?.ticket?.id;
        onOpenChange(false);
        toast.success(tC("ticketStarted", { name: contactDisplayName, ticketId: ticketId ?? "" }));
        if (ticketId) {
          onStarted?.(Number(ticketId));
          goToTicket(ticketId);
        }
      } catch (err) {
        const ticketAtual = extract409Ticket(err);
        if (!ticketAtual) {
          toast.error(tC("errorCreatingTicket"));
          return;
        }
        onOpenChange(false);

        // "Não ver atendimentos de outros": atendente comum não entra no atendimento ativo
        // de outro dono (o 409 não diz se ele é convidado, então vale o bloqueio)
        if (
          isBlockedByNotViewAssigned({
            notViewOn,
            profile: user?.profile,
            meId,
            ticketUserId: ticketAtual.userId ?? null,
            viewerLinked: false,
          })
        ) {
          setAssignedInfo({
            ticketId: ticketAtual.id,
            contactName: contactDisplayName,
            assignedUserId: ticketAtual.userId ?? null,
            assignedUserName: ticketAtual.user?.name ?? null,
            assignedUserProfilePicture: ticketAtual.user?.profilePicture ?? null,
          });
          setAssignedOpen(true);
          return;
        }

        const updateData: Record<string, unknown> = {};
        const isPending = ticketAtual.status === "pending";
        if (isPending) {
          updateData.status = "open";
          updateData.userId = chosenUserId;
          if (queueId) updateData.queueId = queueId;
        }
        if (ticketAtual.whatsappId === null) updateData.whatsapp = connectionId;
        if (Object.keys(updateData).length > 0) {
          try {
            await updateTicket(ticketAtual.id, updateData);
            await new Promise((r) => setTimeout(r, 250));
          } catch { /* segue para o atendimento existente mesmo assim */ }
        }
        onStarted?.(Number(ticketAtual.id));

        if (isPending) {
          // Pendente: confirma antes de levar à conversa (como /contatos)
          setPendingTicket(ticketAtual);
          setPendingOpen(true);
        } else {
          toast.info(tC("ticketExists", { id: ticketAtual.id, name: contactDisplayName }));
          goToTicket(ticketAtual.id);
        }
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const channelsLoading = !channelsReady && connections.length === 0;
  const showNoConnection = channelsReady && connections.length === 0;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onOpenChange(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tC("startTicketTitle")}</DialogTitle>
            <DialogDescription className="break-words">
              {tC("startTicketDesc", { contact: contactDisplayName, channel: channelLabel })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {selectedType === "telegram" && (
              <Alert className="py-2 px-3">
                <Info className="h-4 w-4" />
                <AlertDescription className="pl-6 text-xs">
                  {tCommon("telegramStartTicketNote")}
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label>{tC("connectionLabel")}</Label>
              {showNoConnection ? (
                <Alert variant="warning-soft" className="py-2 px-3">
                  <Info className="h-4 w-4" />
                  <AlertDescription className="pl-6 text-xs">{tF("noChannelToStart")}</AlertDescription>
                </Alert>
              ) : (
                <SearchableSelect
                  options={connectionOptions}
                  value={connectionId != null ? String(connectionId) : ""}
                  onValueChange={(v) => setConnectionId(v ? Number(v) : null)}
                  placeholder={tC("selectConnection")}
                  disabled={channelsLoading && connections.length === 0}
                  renderOption={(o) => {
                    const logo = logoByValue.get(o.value);
                    return (
                      <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
                        {logo && <img src={`/${logo}`} alt="" className="h-4 w-4 shrink-0 object-contain" />}
                        <span className="truncate">{o.label}</span>
                      </div>
                    );
                  }}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>{tC("queueOptional")}</Label>
              <SearchableSelect
                options={queueOptions}
                value={queueId != null ? String(queueId) : "none"}
                onValueChange={(v) => {
                  setQueueId(!v || v === "none" ? null : Number(v));
                  setAttendantId(null);
                }}
                placeholder={tC("noQueue")}
              />
              {queueId != null && (
                <Alert className="py-2 px-3">
                  <Info className="h-4 w-4" />
                  <AlertDescription className="pl-6 text-xs">
                    {tC("queueFilterNotice", { queue: queues.find((q) => q.id === queueId)?.name ?? "" })}
                  </AlertDescription>
                </Alert>
              )}
            </div>
            <div className="space-y-2">
              <Label>{tC("attendantOptional")}</Label>
              <SearchableSelect
                options={attendantOptions}
                value={attendantId != null ? String(attendantId) : "none"}
                onValueChange={(v) => setAttendantId(!v || v === "none" ? null : Number(v))}
                placeholder={tC("noAttendant")}
              />
            </div>
          </div>
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{tC("cancelar")}</Button>
            <Button onClick={() => void handleConfirm()} disabled={submitting || !connectionId}>
              {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {submitting ? tC("starting") : tC("start")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Atendimento ativo de colega que o atendente comum não pode abrir */}
      <TicketAlreadyAssignedDialog open={assignedOpen} onOpenChange={setAssignedOpen} info={assignedInfo} />

      {/* Pendente que acabou de ser assumido: confirma antes de abrir */}
      <Dialog open={pendingOpen} onOpenChange={setPendingOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tC("existingTicketTitle")}</DialogTitle>
            <DialogDescription className="break-words">
              {tC("existingTicketDesc", { name: contactDisplayName })}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2 break-words">
            #{pendingTicket?.id}
            {pendingTicket?.user?.name && ` - ${tC("attendant")} ${pendingTicket.user.name}`}
          </p>
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setPendingOpen(false)}>{tC("cancelar")}</Button>
            <Button
              onClick={() => {
                setPendingOpen(false);
                if (pendingTicket?.id) goToTicket(pendingTicket.id);
              }}
            >
              {tC("openTicket")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Aviso cross-canal (flag crossChannelTicketCheck). No funil o restrito pode abrir (D10). */}
      <ExistingTicketDialog
        open={!!crossChannelTicket}
        onOpenChange={(o) => { if (!o) setCrossChannelTicket(null); }}
        ticket={crossChannelTicket}
        isRestrictedUser={false}
        notViewAssignedTickets={notViewOn}
        targetWhatsappId={connectionId}
        onProceed={() => void handleConfirm(true)}
      />
    </>
  );
}
