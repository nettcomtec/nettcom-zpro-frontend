"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { displayContactIdentity } from "@/lib/contact-identity";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { RefreshCw, Search, Tag, Phone, MessageSquare, MessagesSquare, ChevronLeft, ChevronRight, Eye, Filter } from "lucide-react";
import { ContactConversationDialog } from "@/components/atendimento/contact-conversation-dialog";
import { SpyContactMessagesPopover } from "@/components/atendimento/spy-contact-messages-dialog";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { cn, getInitials } from "@/lib/utils";
import { getReadableTextColor } from "@/lib/color-contrast";
import { fetchTags, type Tag as KanbanTag } from "@/services/tags";
import { createTicket, updateTicket } from "@/services/tickets";
import { findExistingOpenTicket, type ExistingOpenTicket } from "@/lib/check-existing-open-ticket";
import { ExistingTicketDialog } from "@/components/atendimento/existing-ticket-dialog";
import { fetchWhatsapps } from "@/services/whatsapp";
import { fetchQueues, type Queue } from "@/services/queues";
import { fetchAllUsers, type User } from "@/services/users";
import { fetchSettings } from "@/services/settings";
import { useAuthStore } from "@/stores/auth-store";
import { useWhatsappStore } from "@/stores/whatsapp-store";
import api from "@/lib/api";
import { usePageAccess } from "@/hooks/use-page-access";
import { useLiveMode } from "@/hooks/use-live-mode";
import { TicketAlreadyAssignedDialog, type TicketAssignedInfo } from "@/components/atendimento/ticket-already-assigned-dialog";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHelp } from "@/components/layout/page-help";

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
  { type: "messenger", label: "Messenger", logo: "messenger-logo.png" },
  { type: "instagram", label: "Instagram", logo: "instagram-logo.png" },
  { type: "hub_instagram", label: "Hub Instagram", logo: "hub_instagram-logo.png" },
  { type: "hub_facebook", label: "Hub Facebook", logo: "hub_facebook-logo.png" },
  { type: "hub_whatsapp_business_account", label: "Hub WBA", logo: "hub_whatsapp-logo.png" },
];

const NUMBER_CHANNEL_TYPES = ["whatsapp", "baileys", "zapo", "meow", "evo", "evogo", "zapi", "uazapi", "waba", "hub_whatsapp_business_account"];

interface ContactTag {
  tagid: number;
  tag: string;
  color: string;
}

interface TagContact {
  id: number;
  name: string;
  number: string;
  profilePicUrl?: string;
  tags?: ContactTag[] | null;
  wallet?: { id: number; name: string } | null;
}

interface TagColumn {
  tag: KanbanTag;
  contacts: TagContact[];
}

async function fetchContactsTags(params: { searchParam?: string; pageNumber?: number; smartSearch?: boolean }) {
  const { smartSearch = true, ...rest } = params || {};
  return api.get<{ contacts: TagContact[]; count: number; hasMore: boolean }>("/contactsTags/", {
    params: { ...rest, smartSearch },
  });
}

function getPhoneLink(number: string | undefined): string | undefined {
  if (!number) return undefined;
  if (number.startsWith("55") && number.charAt(4) > "5") {
    return `tel:${number.slice(0, 4)}9${number.slice(-8)}`;
  }
  return `tel:${number}`;
}

export default function KanbanTagsPage() {
  const t = useTranslations("kanbanTagsPage");
  const tCommon = useTranslations("common");
  const allowed = usePageAccess("kanban");
  if (!allowed) return <AccessDenied />;
  const router = useRouter();
  const { user, isAdmin, isSuporte, supervisorAdmin, getConfigValue, isRestrictedUser } = useAuthStore();
  const whatsapps = useWhatsappStore((s) => s.whatsapps);
  const isAdminLike = user?.profile === "admin" || (user?.profile === "super" && supervisorAdmin !== "enabled");
  const setWhatsapps = useWhatsappStore((s) => s.setWhatsapps);

  const [columns, setColumns] = useState<TagColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [queues, setQueues] = useState<Queue[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [notViewAssignedTickets, setNotViewAssignedTickets] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Start ticket modal state
  const [startTicketOpen, setStartTicketOpen] = useState(false);
  const [startTicketContact, setStartTicketContact] = useState<TagContact | null>(null);
  const [startTicketChannelType, setStartTicketChannelType] = useState<string>("");
  const [startTicketChannelLabel, setStartTicketChannelLabel] = useState<string>("");
  const [startTicketConnections, setStartTicketConnections] = useState<{ id: number; name: string }[]>([]);
  const [startTicketConnectionId, setStartTicketConnectionId] = useState<number | null>(null);
  // Aviso cross-canal (flag do tenant crossChannelTicketCheck): ticket aberto em OUTRO canal
  const [crossChannelTicket, setCrossChannelTicket] = useState<ExistingOpenTicket | null>(null);
  const [startTicketQueueId, setStartTicketQueueId] = useState<number | null>(null);
  const [startTicketUserId, setStartTicketUserId] = useState<number | null>(null);
  const [startTicketSubmitting, setStartTicketSubmitting] = useState(false);
  const [assignedDialogOpen, setAssignedDialogOpen] = useState(false);
  const [assignedDialogInfo, setAssignedDialogInfo] = useState<TicketAssignedInfo | null>(null);

  // ── Channel helpers ───────────────────────────────────────────────────────

  const getChannelWhatsapps = useCallback((type: string) => {
    const connected = whatsapps.filter((w) => !w.isDeleted && w.status === "CONNECTED" && (w.type || w.channel) === type);
    if (isAdminLike) return connected;
    const allowedIds = ((user?.whatsappAllowed as { id: number }[]) || []).map((w) => w.id);
    return connected.filter((w) => allowedIds.includes(w.id));
  }, [whatsapps, isAdminLike, user?.whatsappAllowed]);

  const getContactChannelOptions = useCallback((contact: TagContact) => {
    return CHANNEL_TYPES.flatMap((ch) => {
      const sessions = getChannelWhatsapps(ch.type);
      if (sessions.length === 0) return [];
      if (NUMBER_CHANNEL_TYPES.includes(ch.type)) {
        return contact.number ? [{ ch, connections: sessions }] : [];
      }
      return [];
    });
  }, [getChannelWhatsapps]);

  // ── Start ticket logic ────────────────────────────────────────────────────

  const openStartTicketModal = useCallback((
    contact: TagContact,
    ch: typeof CHANNEL_TYPES[0],
    connections: { id: number; name: string }[],
  ) => {
    setStartTicketContact(contact);
    setStartTicketChannelType(ch.type);
    setStartTicketChannelLabel(ch.label);
    setStartTicketConnections(connections);
    setStartTicketConnectionId(connections.length === 1 ? connections[0].id : null);
    setStartTicketQueueId(null);
    setStartTicketUserId(null);
    setStartTicketOpen(true);
  }, []);

  const extract409Ticket = (err: unknown) => {
    const resp = err as { status?: number; data?: Record<string, unknown> };
    if (resp?.status !== 409) return null;
    const d = resp.data;
    if (!d) return null;
    if (d.ticket && typeof d.ticket === "object") return d.ticket as { id: number; status: string; userId?: number; user?: { name: string }; whatsappId?: number | null };
    const raw = d.message ?? d.error;
    if (!raw) return null;
    try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; }
  };

  const handleConfirmStartTicket = async (skipPrecheck = false) => {
    if (!startTicketContact || !startTicketConnectionId) return;
    setStartTicketSubmitting(true);

    // Pre-check cross-canal (gated pela flag do tenant): avisa se o contato ja tem ticket
    // aberto/pending em OUTRO canal. Same-channel segue via fluxo 409 (extract409Ticket).
    if (
      !skipPrecheck &&
      getConfigValue("crossChannelTicketCheck") === "enabled" &&
      startTicketContact.number
    ) {
      try {
        const cross = await findExistingOpenTicket({
          number: startTicketContact.number,
          whatsappId: startTicketConnectionId,
          currentUserId: user?.userId ?? null,
        });
        if (cross && cross.whatsappId != null && Number(cross.whatsappId) !== Number(startTicketConnectionId)) {
          setStartTicketOpen(false);
          setCrossChannelTicket(cross);
          setStartTicketSubmitting(false);
          return;
        }
      } catch { /* silenciar — nao bloquear criacao se pre-check falhar */ }
    }

    try {
      const payload: Record<string, unknown> = {
        contactId: startTicketContact.id,
        isActiveDemand: true,
        userId: startTicketUserId ?? user?.userId,
        channel: startTicketChannelType,
        channelId: startTicketConnectionId,
        status: "open",
      };
      if (startTicketQueueId) payload.queueId = startTicketQueueId;
      const { data } = await createTicket(payload);
      const ticketId = data?.id || data?.ticket?.id;
      setStartTicketOpen(false);
      toast.success(t("ticketStarted", { name: startTicketContact.name, id: ticketId }));
      router.push(`/atendimento?ticketId=${ticketId}`);
    } catch (err) {
      const ticketAtual = extract409Ticket(err);
      if (ticketAtual) {
        setStartTicketOpen(false);
        if (notViewAssignedTickets && !isAdmin && !isSuporte) {
          setAssignedDialogInfo({
            ticketId: ticketAtual.id,
            contactName: startTicketContact.name,
            assignedUserId: ticketAtual.userId ?? null,
            assignedUserName: ticketAtual.user?.name ?? null,
            assignedUserProfilePicture:
              (ticketAtual.user as { profilePicture?: string } | undefined)?.profilePicture ?? null,
          });
          setAssignedDialogOpen(true);
          setStartTicketSubmitting(false);
          return;
        }
        const updateData: Record<string, unknown> = {};
        if (ticketAtual.status === "pending") {
          updateData.status = "open";
          updateData.userId = startTicketUserId ?? user?.userId;
          if (startTicketQueueId) updateData.queueId = startTicketQueueId;
        }
        if (ticketAtual.whatsappId === null) updateData.whatsapp = startTicketConnectionId;
        if (Object.keys(updateData).length > 0) {
          try { await updateTicket(ticketAtual.id, updateData); await new Promise((r) => setTimeout(r, 250)); } catch { /* ignore */ }
        }
        toast.info(t("ticketExists", { id: ticketAtual.id, name: startTicketContact.name }));
        router.push(`/atendimento?ticketId=${ticketAtual.id}`);
      } else {
        toast.error(t("createTicketError"));
      }
    } finally {
      setStartTicketSubmitting(false);
    }
  };

  // ── Load data ────────────────────────────────────────────────────────────

  const [crmOpen, setCrmOpen] = useState(false);
  const [crmContact, setCrmContact] = useState<TagContact | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const tagsRes = await fetchTags();
      const tagList: KanbanTag[] = Array.isArray(tagsRes.data) ? tagsRes.data : [];
      tagList.sort((a, b) => a.id - b.id);

      let allContacts: TagContact[] = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const res = await fetchContactsTags({ pageNumber: page });
        const d = res.data;
        const contacts = Array.isArray(d) ? d : d?.contacts ?? [];
        allContacts = [...allContacts, ...contacts];
        hasMore = d?.hasMore ?? false;
        page++;
        if (page > 50) break;
      }

      allContacts.sort((a, b) => a.id - b.id);

      const cols: TagColumn[] = tagList.map((tag) => ({ tag, contacts: [] }));
      allContacts.forEach((contact) => {
        if (!contact.tags || contact.tags === null) return;
        contact.tags.forEach((contactTag) => {
          const col = cols.find((c) => c.tag.id === contactTag.tagid);
          if (col && !col.contacts.some((c) => c.id === contact.id)) {
            col.contacts.push(contact);
          }
        });
      });

      setColumns(cols);
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    fetchWhatsapps().then(({ data }) => {
      const all = Array.isArray(data) ? data : [];
      setWhatsapps(all.filter((w) => !(w as any).isDeleted));
    });
    fetchQueues().then(({ data: q }) => setQueues(q));
    fetchAllUsers().then(({ data }) => {
      const arr = (data?.users || []).filter((u: { profile?: string }) => u.profile !== "superadmin");
      setUsers(arr);
    });
    fetchSettings().then(({ data }) => {
      const list: { key: string; value: string }[] = Array.isArray(data) ? data : data?.settings || [];
      const conf = list.find((s) => s.key === "NotViewAssignedTickets");
      setNotViewAssignedTickets(conf?.value === "enabled");
    });
  }, [loadAll]);

  const boardRef = useRef<HTMLDivElement | null>(null);
  const scrollBoard = useCallback((dir: -1 | 1) => {
    const el = boardRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 320, behavior: "smooth" });
  }, []);

  const filterContacts = (contacts: TagContact[]) => {
    if (!search.trim()) return contacts;
    const q = search.toLowerCase();
    return contacts.filter(
      (c) => c.name?.toLowerCase().includes(q) || c.number?.includes(q)
    );
  };

  const visibleColumns = columns.filter((col) => {
    if (statusFilter === "active") return col.tag.isActive !== false;
    if (statusFilter === "inactive") return col.tag.isActive === false;
    return true;
  });

  // ── Loading skeleton ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-72 shrink-0 space-y-2">
            <Skeleton className="h-10 w-full rounded-lg" />
            {Array.from({ length: 3 }).map((_, j) => (
              <Skeleton key={j} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap shrink-0">
        <PageHelp
          description={t("helpDesc")}
          sections={[
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
            { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
          ]}
        />
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="pl-8 h-8"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "active" | "inactive")}>
          <SelectTrigger className="h-8 w-auto min-w-[120px] gap-1.5" aria-label={t("statusFilterAria")}>
            <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("statusFilterAll")}</SelectItem>
            <SelectItem value="active">{t("statusFilterActive")}</SelectItem>
            <SelectItem value="inactive">{t("statusFilterInactive")}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={loadAll} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          {t("refresh")}
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => scrollBoard(-1)} aria-label={tCommon("scrollLeft")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => scrollBoard(1)} aria-label={tCommon("scrollRight")}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Board */}
      {visibleColumns.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm border-2 border-dashed rounded-lg">
          <div className="flex flex-col items-center gap-2">
            <Tag className="h-8 w-8 opacity-40" />
            <p>{columns.length === 0 ? t("noTagsTitle") : t("noTagsForStatus")}</p>
          </div>
        </div>
      ) : (
        <div
          ref={boardRef}
          className="flex-1 min-h-0 flex gap-4 overflow-x-auto pb-2"
          style={{ scrollbarGutter: "stable" }}
        >
          {visibleColumns.map((col) => {
            const filtered = filterContacts(col.contacts);
            const tagColor = col.tag.color || "#94a3b8";

            return (
              <div
                key={col.tag.id}
                className="shrink-0 flex flex-col h-full min-h-0"
                style={{ width: 300 }}
              >
                {/* Column header — mesmo padrão do board */}
                <div
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold mb-2 shrink-0 shadow-sm text-gray-800 dark:text-gray-100"
                  style={{
                    backgroundColor: `${tagColor}22`,
                    borderLeft: `4px solid ${tagColor}`,
                  }}
                >
                  <span className="truncate">{col.tag.name}</span>
                  <Badge
                    variant="secondary"
                    className="text-xs ml-2 shrink-0 tabular-nums"
                    style={{ borderColor: tagColor, color: tagColor }}
                  >
                    {col.contacts.length}
                  </Badge>
                </div>

                {/* Cards area — mesmo padrão do board */}
                <div
                  className="flex-1 min-h-0 flex flex-col gap-2 rounded-xl p-2 transition-all border-2 border-transparent bg-gray-100/70 dark:bg-gray-800/60 overflow-y-auto"
                  style={{ scrollbarWidth: "thin" }}
                >
                  {filtered.length === 0 ? (
                    <div className="flex items-center justify-center h-16 text-[11px] text-muted-foreground select-none">
                      {search ? t("noResults") : t("noContactsInTag")}
                    </div>
                  ) : (
                    filtered.map((contact) => {
                      const channelOptions = getContactChannelOptions(contact);
                      return (
                        <ContactCard
                          key={contact.id}
                          contact={contact}
                          channelOptions={channelOptions}
                          onStartTicket={openStartTicketModal}
                          onOpenCrm={(c) => { setCrmContact(c); setCrmOpen(true); }}
                        />
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Start Ticket Modal */}
      <Dialog open={startTicketOpen} onOpenChange={(open) => { if (!open) setStartTicketOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("startTicketTitle")}</DialogTitle>
            <DialogDescription>
              {t("contact")}: <strong>{startTicketContact?.name}</strong> — {t("channel")}: <strong>{startTicketChannelLabel}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {startTicketConnections.length > 1 && (
              <div className="space-y-2">
                <Label>{t("connection")} *</Label>
                <Select value={startTicketConnectionId != null ? String(startTicketConnectionId) : ""} onValueChange={(v) => setStartTicketConnectionId(Number(v))}>
                  <SelectTrigger><SelectValue placeholder={t("selectConnection")} /></SelectTrigger>
                  <SelectContent>
                    {startTicketConnections.map((w) => (
                      <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>{t("queue")}</Label>
              <Select value={startTicketQueueId != null ? String(startTicketQueueId) : "none"} onValueChange={(v) => { setStartTicketQueueId(v === "none" ? null : Number(v)); setStartTicketUserId(null); }}>
                <SelectTrigger><SelectValue placeholder={t("noQueue")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("noQueue")}</SelectItem>
                  {queues.filter((q) => q.isActive !== false).map((q) => (
                    <SelectItem key={q.id} value={String(q.id)}>{q.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("agent")}</Label>
              <Select value={startTicketUserId != null ? String(startTicketUserId) : "none"} onValueChange={(v) => setStartTicketUserId(v === "none" ? null : Number(v))}>
                <SelectTrigger><SelectValue placeholder={t("noAgent")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("noAgent")}</SelectItem>
                  {users
                    .filter((u) => {
                      if (!startTicketQueueId) return true;
                      const uWithQueues = u as { queues?: { id: number }[] };
                      return uWithQueues.queues?.some((q) => q.id === startTicketQueueId) ?? true;
                    })
                    .map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartTicketOpen(false)}>{t("cancel")}</Button>
            <Button onClick={() => handleConfirmStartTicket()} disabled={startTicketSubmitting || !startTicketConnectionId}>
              {startTicketSubmitting ? t("starting") : t("start")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Aviso cross-canal: contato com ticket aberto em OUTRO canal (flag crossChannelTicketCheck) */}
      <ExistingTicketDialog
        open={!!crossChannelTicket}
        onOpenChange={(o) => { if (!o) setCrossChannelTicket(null); }}
        ticket={crossChannelTicket}
        isRestrictedUser={isRestrictedUser()}
        notViewAssignedTickets={notViewAssignedTickets}
        targetWhatsappId={startTicketConnectionId}
        onProceed={() => handleConfirmStartTicket(true)}
      />

      <TicketAlreadyAssignedDialog
        open={assignedDialogOpen}
        onOpenChange={setAssignedDialogOpen}
        info={assignedDialogInfo}
      />

      <ContactConversationDialog
        open={crmOpen}
        onOpenChange={setCrmOpen}
        contact={crmContact ? {
          id: crmContact.id,
          name: crmContact.name || "",
          number: crmContact.number ?? undefined,
          profilePicUrl: crmContact.profilePicUrl ?? undefined,
        } : null}
        onChanged={loadAll}
      />
    </div>
  );
}

interface ContactCardProps {
  contact: TagContact;
  channelOptions: { ch: typeof CHANNEL_TYPES[0]; connections: { id: number; name: string }[] }[];
  onStartTicket: (contact: TagContact, ch: typeof CHANNEL_TYPES[0], connections: { id: number; name: string }[]) => void;
  onOpenCrm: (contact: TagContact) => void;
}

function ContactCard({ contact, channelOptions, onStartTicket, onOpenCrm }: ContactCardProps) {
  const t = useTranslations("kanbanTagsPage");
  const { isLiveMode } = useLiveMode();
  const [imgError, setImgError] = useState(false);
  const phoneLink = getPhoneLink(contact.number);

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 space-y-2 select-none">
      {/* Header: avatar + info + action */}
      <div className="flex items-start gap-2">
        <Avatar className={cn("h-9 w-9 shrink-0", isLiveMode && "live-blur")}>
          {contact.profilePicUrl && !imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={contact.profilePicUrl}
              alt={contact.name}
              className="rounded-full object-cover h-9 w-9"
              onError={() => setImgError(true)}
            />
          ) : (
            <AvatarFallback className="text-[10px] bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
              {getInitials(contact.name)}
            </AvatarFallback>
          )}
        </Avatar>

        <div className="flex-1 min-w-0">
          <p className={cn("text-sm font-semibold text-gray-800 dark:text-gray-100 truncate leading-tight", isLiveMode && "live-blur-text")}>
            {contact.name || "—"}
          </p>
          {contact.number ? (
            <a
              href={phoneLink}
              onClick={(e) => e.stopPropagation()}
              className={cn("flex items-center gap-0.5 text-[11px] text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors", isLiveMode && "live-blur-text")}
            >
              <Phone className="h-2.5 w-2.5" />
              <span>{displayContactIdentity(contact)}</span>
            </a>
          ) : (
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{t("noNumber")}</p>
          )}
        </div>

        <SpyContactMessagesPopover contactId={contact.id} contactName={contact.name}>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            title={t("spyConversation")}
            className="p-0.5 rounded text-gray-400 dark:text-gray-500 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 transition-colors shrink-0"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        </SpyContactMessagesPopover>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpenCrm(contact); }}
          title={t("openCrmDialog")}
          className="p-0.5 rounded text-gray-400 dark:text-gray-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors shrink-0"
        >
          <MessagesSquare className="h-3.5 w-3.5" />
        </button>
        {channelOptions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                title={t("startTicketTitle")}
                className="p-0.5 rounded text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors shrink-0"
              >
                <MessageSquare className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t("startTicketTitle")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {channelOptions.map(({ ch, connections }) => (
                <DropdownMenuItem
                  key={ch.type}
                  onClick={() => onStartTicket(contact, ch, connections)}
                >
                  <img src={`/${ch.logo}`} alt={ch.label} className="h-4 w-4 object-contain mr-2" />
                  {ch.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Tags badges */}
      {contact.tags && contact.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {contact.tags.map((tag) => (
            <span
              key={tag.tagid}
              className="inline-block text-[9px] px-1.5 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: tag.color || "#6b7280", color: getReadableTextColor(tag.color || "#6b7280") }}
              title={tag.tag}
            >
              {tag.tag}
            </span>
          ))}
        </div>
      )}

      {/* Wallet */}
      {contact.wallet && (
        <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500">
          <Phone className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{contact.wallet.name ?? contact.wallet}</span>
        </div>
      )}

      {/* Footer: contact id */}
      <div className="flex justify-end">
        <p className="text-[9px] text-gray-300 dark:text-gray-600">#{contact.id}</p>
      </div>
    </div>
  );
}
