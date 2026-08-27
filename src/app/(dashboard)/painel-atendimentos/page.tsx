"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { format, sub, startOfDay, endOfDay, parseISO } from "date-fns";
import { motion } from "framer-motion";
import {
  Users, Clock, MessageSquare, Filter, X, ArrowRightLeft,
  CheckCheck, Mail, RefreshCw, ChevronDown, User as UserIcon,
  LogIn, Eye, AlertTriangle, HelpCircle, Wifi, Info,
  Radio, Loader2, RotateCw, CalendarClock, CalendarCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/layout/page-header";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { useAuthStore } from "@/stores/auth-store";
import api from "@/lib/api";
import { getTicketListPreview } from "@/lib/template-preview";
import { EspiarConversaDialog } from "@/components/atendimento/espiar-conversa-dialog";
import { ExistingTicketDialog } from "@/components/atendimento/existing-ticket-dialog";
import { findCrossChannelSiblingForTicket, type ExistingOpenTicket } from "@/lib/check-existing-open-ticket";
import { usePageAccess } from "@/hooks/use-page-access";
import { useLiveMode } from "@/hooks/use-live-mode";
import { usePainelRealtime } from "@/hooks/use-painel-realtime";
import { cn } from "@/lib/utils";
import { AccessDenied } from "@/components/layout/access-denied";

interface PainelTicket {
  id: number;
  status: string;
  userId: number | null;
  queueId: number | null;
  whatsappId: number | null;
  channel: string;
  lastMessage: string;
  updatedAt: string;
  // Ambos vem do /dash-tickets-queues (estao na lista de attributes do service).
  // createdAt e timestamp Sequelize (ISO); lastMessageAt e BIGINT, logo chega como
  // string de epoch em ms — por isso o parse passa por toEpochMs, nunca new Date().
  createdAt?: string;
  lastMessageAt?: string | number | null;
  unreadMessages: number;
  contact?: { id: number; name: string; number: string; profilePicUrl?: string };
  user?: { id: number; name: string };
  queue?: { id: number; queue: string; color: string };
}

interface Queue {
  id: number;
  queue: string;
  color: string;
  isActive?: boolean;
}

interface UserOption {
  id: number;
  name: string;
  queues: { id: number }[];
}

interface WhatsappChannel {
  id: number;
  name: string;
  type: string;
  status: string;
  isDeleted: boolean;
}

type ViewType = "U" | "F" | "C";

function timeAgo(date: string, nowLabel = ""): string {
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return nowLabel;
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function timeAgoColor(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins >= 1440) return "text-red-500";
  if (mins >= 60) return "text-yellow-500";
  return "text-muted-foreground";
}

// Normaliza as duas formas de data que o painel recebe: ISO (createdAt) e epoch em
// ms vindo de coluna BIGINT (lastMessageAt, que o driver entrega como string).
// new Date("1787144902812") daria Invalid Date, por isso o teste de digitos vem antes.
function toEpochMs(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const asNumber = Number(trimmed);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

async function fetchPainelTickets(params: {
  showAll: boolean;
  dateStart?: string;
  dateEnd?: string;
  // Cache-buster: no modo Ao Vivo a URL fica fixa (sem datas) e bateria no
  // httpCache de 30s da rota de relatorios. Um timestamp unico forca MISS =>
  // dado sempre fresco. So enviado no modo realtime.
  _?: number;
}) {
  return api.get<PainelTicket[]>("/dash-tickets-queues", { params });
}

async function fetchQueuesApi() {
  return api.get<Queue[]>("/queue");
}

async function fetchUsersApi(page = 1) {
  return api.get<{ users: UserOption[]; hasMore: boolean }>("/users", { params: { pageNumber: page } });
}

async function fetchWhatsappsByTenant() {
  return api.get<WhatsappChannel[]>("/whatsappByTenant");
}

async function updateTicket(ticketId: number, data: Record<string, unknown>) {
  return api.put(`/tickets/${ticketId}`, data);
}

async function markAllAsRead() {
  return api.get("/ticketsMarkAllUnread");
}

async function transferBetweenQueues(data: {
  sourceQueueId: number | null;
  destinationQueueId: number;
  userId: number | null;
}) {
  return api.post("/ticketsTransferBetweenQueues", data);
}

async function transferBetweenChannels(data: {
  sourceChannel: string;
  sourceWhatsappId: number;
  destinationChannel: string;
  destinationWhatsappId: number;
}) {
  return api.post("/ticketsTransferBetweenChannels", data);
}

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = String(item[key] ?? "null");
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

export default function PainelAtendimentosPage() {
  const t = useTranslations("painelAtendimentosPage");
  // Chaves de preview de mídia/noMessages vivem no namespace do atendimento
  const tAtd = useTranslations("atendimentoChatExtra");
  const allowed = usePageAccess("painel-atendimentos", { adminSuperOnly: true });
  const router = useRouter();
  const { isAdmin, user, isRestrictedUser, getConfigValue } = useAuthStore();
  const userId = user?.userId;
  const { isLiveMode } = useLiveMode();

  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<PainelTicket[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [whatsapps, setWhatsapps] = useState<WhatsappChannel[]>([]);

  const [dateStart, setDateStart] = useState(format(sub(new Date(), { days: 2 }), "yyyy-MM-dd"));
  const [dateEnd, setDateEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const [showAll, setShowAll] = useState(isAdmin);
  const [viewType, setViewType] = useState<ViewType>("U");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Modo do painel: "realtime" (Ao Vivo, padrao) atualiza sozinho via socket + rede
  // de seguranca; "period" congela num intervalo de datas para auditoria. NAO
  // confundir com isLiveMode (Modo Apresentacao/blur) — sao ortogonais e coexistem.
  const [panelFeed, setPanelFeed] = useState<"realtime" | "period">("realtime");
  const isRealtime = panelFeed === "realtime";
  // Incrementado para forcar um refetch (aplicar periodo / atualizar agora) sem
  // depender das datas estarem nas deps do efeito (evita refetch a cada tecla).
  const [reloadNonce, setReloadNonce] = useState(0);
  const forceReload = useCallback(() => setReloadNonce((n) => n + 1), []);
  // Alterna o modo do painel (o refetch e disparado pelo efeito via reloadNonce).
  const enterRealtime = useCallback(() => { setPanelFeed("realtime"); forceReload(); }, [forceReload]);
  const enterPeriod = useCallback(() => { setPanelFeed("period"); forceReload(); }, [forceReload]);
  // Destaque visual (sem som) de pendentes que acabaram de entrar ao vivo.
  const [recentIds, setRecentIds] = useState<Set<number>>(new Set());

  const [transferQueueOpen, setTransferQueueOpen] = useState(false);
  const [transferUserOpen, setTransferUserOpen] = useState(false);
  const [transferBetweenQueuesOpen, setTransferBetweenQueuesOpen] = useState(false);
  const [transferBetweenChannelsOpen, setTransferBetweenChannelsOpen] = useState(false);
  const [closePendingOpen, setClosePendingOpen] = useState(false);
  const [closeOpenOpen, setCloseOpenOpen] = useState(false);
  // Encerramento em massa recortado pelo periodo do painel. Diferente dos dois
  // acima (que atuam no tenant inteiro por status), este fecha SOMENTE o que caiu
  // na janela de datas escolhida — e sempre em silencio, sem despedida.
  const [closePeriodOpen, setClosePeriodOpen] = useState(false);
  // Qual coluna a janela de datas considera. "createdAt" = abertura do atendimento
  // (mesmo criterio que o painel usa para montar a lista); "lastMessageAt" = ultima
  // mensagem, que responde melhor a "encerra tudo parado desde antes de X".
  const [periodDateField, setPeriodDateField] = useState<"createdAt" | "lastMessageAt">("createdAt");
  const [periodCandidates, setPeriodCandidates] = useState<PainelTicket[]>([]);
  const [periodLoading, setPeriodLoading] = useState(false);

  const [selectedQueue, setSelectedQueue] = useState<string>("");
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [sourceUser, setSourceUser] = useState<string>("");
  const [destUser, setDestUser] = useState<string>("");
  const [sourceQueue, setSourceQueue] = useState<string>("");
  const [destQueue, setDestQueue] = useState<string>("");
  const [destUserForQueue, setDestUserForQueue] = useState<string>("");
  const [sourceChannel, setSourceChannel] = useState<string>("");
  const [destChannel, setDestChannel] = useState<string>("");
  const [actionLoading, setActionLoading] = useState(false);
  // Progresso de operações em massa: phase = "fetching" | "processing" | "transferring".
  // Quando total > 0, exibimos barra "{current}/{total}". Quando total === 0 e phase definida, exibimos só o label.
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [progressPhase, setProgressPhase] = useState<"fetching" | "processing" | "transferring" | null>(null);
  const resetProgress = useCallback(() => {
    setProgressCurrent(0);
    setProgressTotal(0);
    setProgressPhase(null);
  }, []);
  const [conflictResolution, setConflictResolution] = useState<"pending" | "assign">("pending");
  const [conflictAssignUser, setConflictAssignUser] = useState<string>("");
  const [spyOpen, setSpyOpen] = useState(false);
  const [spyTicket, setSpyTicket] = useState<PainelTicket | null>(null);
  // Aviso de atendimento duplicado ao "Atender" pelo painel (mesmo canal sempre;
  // outro canal só com a flag crossChannelTicketCheck ligada).
  const [atenderCrossTicket, setAtenderCrossTicket] = useState<ExistingOpenTicket | null>(null);
  const [atenderTargetTicket, setAtenderTargetTicket] = useState<PainelTicket | null>(null);

  // Encerramento em massa NAO dispara a despedida do canal por padrao: o
  // PUT /tickets/:id manda farewellMessage a cada contato quando o body nao traz
  // skipFarewell, e um "Resolver todos" pode virar centenas de mensagens saindo
  // da mesma sessao de uma vez. O operador ainda consegue o comportamento antigo
  // desligando o toggle no proprio dialog.
  const [skipFarewellBulk, setSkipFarewellBulk] = useState(true);

  // Pré-contagem + breakdown por canal ao abrir os modais de Resolver
  // (não depende do filtro de data do painel — bate em todos os tickets do tenant).
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewBreakdown, setPreviewBreakdown] = useState<Array<{
    whatsappId: number | null;
    whatsappName: string | null;
    channel: string | null;
    count: number;
  }>>([]);

  // Snapshot dos parametros de busca, lido dentro de consultarTickets SEM torna-los
  // deps (mantem consultarTickets estavel e evita re-registrar o realtime a cada
  // mudanca de filtro). Atualizado a cada render.
  const paramsRef = useRef({ dateStart, dateEnd, showAll, isRealtime });
  paramsRef.current = { dateStart, dateEnd, showAll, isRealtime };
  // Ids conhecidos na ultima carga (para detectar novos pendentes).
  const knownIdsRef = useRef<Set<number>>(new Set());
  // Timers de expiracao do destaque "novo" por ticket.
  const recentTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const markRecent = useCallback((ids: number[]) => {
    setRecentIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    ids.forEach((id) => {
      const existing = recentTimersRef.current.get(id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        setRecentIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        recentTimersRef.current.delete(id);
      }, 6000);
      recentTimersRef.current.set(id, timer);
    });
  }, []);

  const loadQueues = useCallback(async () => {
    try {
      const { data } = await fetchQueuesApi();
      setQueues(Array.isArray(data) ? data : []);
    } catch { /* silent */ }
  }, []);

  const loadAllUsers = useCallback(async () => {
    try {
      let allUsers: UserOption[] = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const { data } = await fetchUsersApi(page);
        const newUsers = (data.users || []).filter((u: UserOption & { profile?: string }) => u.profile !== "superadmin");
        allUsers = [...allUsers, ...newUsers];
        hasMore = data.hasMore;
        page++;
      }
      setUsers(allUsers);
    } catch { /* silent */ }
  }, []);

  const loadWhatsapps = useCallback(async () => {
    try {
      const { data } = await fetchWhatsappsByTenant();
      setWhatsapps(Array.isArray(data) ? data : []);
    } catch { /* silent */ }
  }, []);

  // Busca central do painel. Estavel (le params via ref) para servir tanto a carga
  // inicial quanto o realtime. opts.silent = refetch de fundo (socket/rede de
  // seguranca): nao mostra skeleton e preserva a lista anterior em erro transitorio.
  const consultarTickets = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    const { dateStart, dateEnd, showAll, isRealtime } = paramsRef.current;
    if (!silent) setLoading(true);
    try {
      const params: { showAll: boolean; dateStart?: string; dateEnd?: string; _?: number } = { showAll };
      if (isRealtime) {
        // Ao Vivo: sem filtro de data (todos open+pending do escopo) + cache-buster.
        params._ = Date.now();
      } else {
        params.dateStart = dateStart;
        params.dateEnd = dateEnd;
      }
      const { data } = await fetchPainelTickets(params);
      const list = Array.isArray(data) ? data : [];
      // Novos pendentes desde a ultima carga => destaque visual (sem som).
      if (isRealtime && knownIdsRef.current.size > 0) {
        const fresh: number[] = [];
        for (const tk of list) {
          if (tk.status === "pending" && !knownIdsRef.current.has(tk.id)) fresh.push(tk.id);
        }
        if (fresh.length) markRecent(fresh);
      }
      knownIdsRef.current = new Set(list.map((tk) => tk.id));
      setTickets(list);
    } catch {
      // Erro em refetch silencioso NAO deve zerar a lista (piscaria "Nenhum
      // atendimento"). So o load inicial visivel limpa.
      if (!silent) setTickets([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [markRecent]);

  // Bootstrap: filas e canais carregam uma vez (nao dependem de modo/filtro).
  useEffect(() => {
    loadQueues();
    loadWhatsapps();
  }, [loadQueues, loadWhatsapps]);

  // Carga da lista: no mount, ao trocar de modo (Ao Vivo <-> periodo), ao mudar
  // showAll, ou quando forcado (aplicar periodo / atualizar agora). As datas NAO
  // entram nas deps de proposito — mudar data no dialog nao refetcha a cada tecla.
  useEffect(() => {
    consultarTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultarTickets, panelFeed, showAll, reloadNonce]);

  // Limpeza dos timers de destaque "novo" ao desmontar.
  useEffect(() => {
    const timers = recentTimersRef.current;
    return () => {
      timers.forEach((tm) => clearTimeout(tm));
      timers.clear();
    };
  }, []);

  // --- Realtime (modo Ao Vivo) ---
  // Refetch silencioso ao chegar evento de ticket. Desabilitado fora do Ao Vivo e
  // durante acao em massa (evita tempestade de refetch no fechar/transferir em lote).
  const { connected: liveConnected, reconnecting: liveReconnecting } = usePainelRealtime({
    enabled: isRealtime && !actionLoading,
    onRefresh: () => consultarTickets({ silent: true }),
  });

  // Rede de seguranca: certos encerramentos (ex.: bot de IA) fecham o ticket sem
  // emitir evento de ticket. Um refetch periodico garante que o card encerrado saia
  // da tela mesmo assim. So no Ao Vivo, com a aba visivel, fora de acao em massa.
  useEffect(() => {
    if (!isRealtime || actionLoading) return;
    const SAFETY_MS = 25_000;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      consultarTickets({ silent: true });
    }, SAFETY_MS);
    return () => clearInterval(id);
  }, [isRealtime, actionLoading, consultarTickets]);

  const fetchStatusCount = useCallback(async (status: string) => {
    setPreviewLoading(true);
    setPreviewCount(null);
    setPreviewBreakdown([]);
    try {
      const { data } = await api.get<{
        total: number;
        byChannel: Array<{ whatsappId: number | null; whatsappName: string | null; channel: string | null; count: number }>;
      }>("/tickets-frontnovo/breakdown-channel", { params: { status: [status] } });
      setPreviewCount(typeof data?.total === "number" ? data.total : 0);
      setPreviewBreakdown(Array.isArray(data?.byChannel) ? data.byChannel : []);
    } catch {
      setPreviewCount(0);
      setPreviewBreakdown([]);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (closeOpenOpen) {
      fetchStatusCount("open");
    } else if (!closePendingOpen) {
      setPreviewCount(null);
      setPreviewBreakdown([]);
      setPreviewLoading(false);
    }
  }, [closeOpenOpen, closePendingOpen, fetchStatusCount]);

  useEffect(() => {
    if (closePendingOpen) {
      fetchStatusCount("pending");
    } else if (!closeOpenOpen) {
      setPreviewCount(null);
      setPreviewBreakdown([]);
      setPreviewLoading(false);
    }
  }, [closePendingOpen, closeOpenOpen, fetchStatusCount]);

  const grouped = useMemo(() => {
    const field = viewType === "U" ? "userId" : viewType === "C" ? "whatsappId" : "queueId";
    const groups = groupBy(tickets, field);
    // Ordena os grupos pelo nome exibido (asc, case-insensitive); grupos sem
    // atribuicao (pendente / sem fila / sem canal) ficam sempre por ultimo.
    const labelOf = (key: string, items: PainelTicket[]): string => {
      if (key === "null") return "";
      if (viewType === "U") return items[0]?.user?.name ?? "";
      if (viewType === "C") return whatsapps.find((w) => w.id === Number(key))?.name ?? "";
      return queues.find((q) => q.id === Number(key))?.queue ?? "";
    };
    return Object.entries(groups).sort(([keyA, itemsA], [keyB, itemsB]) => {
      const labelA = labelOf(keyA, itemsA);
      const labelB = labelOf(keyB, itemsB);
      if (!labelA !== !labelB) return labelA ? -1 : 1;
      const byName = labelA.localeCompare(labelB, undefined, { sensitivity: "base" });
      return byName !== 0 ? byName : keyA.localeCompare(keyB);
    });
  }, [tickets, viewType, queues, whatsapps]);

  const totalOpen = useMemo(() => tickets.filter((t) => t.status === "open").length, [tickets]);
  const totalPending = useMemo(() => tickets.filter((t) => t.status === "pending").length, [tickets]);
  const totalTickets = tickets.length;

  const conflictingTickets = useMemo(() => {
    if (!destQueue || !transferBetweenQueuesOpen || users.length === 0) return [];
    const destQueueId = Number(destQueue);
    const accessSet = new Set(
      users.filter(u => u.queues.some(q => q.id === destQueueId)).map(u => u.id)
    );
    const srcQueueId = sourceQueue ? Number(sourceQueue) : null;
    return tickets.filter(t => {
      const matchesSrc = srcQueueId === null ? !t.queueId : t.queueId === srcQueueId;
      return matchesSrc && t.userId !== null && !accessSet.has(t.userId!);
    });
  }, [destQueue, sourceQueue, tickets, users, transferBetweenQueuesOpen]);

  const usersInDestQueue = useMemo(() => {
    if (!destQueue) return [];
    const destQueueId = Number(destQueue);
    return users.filter(u => u.queues.some(q => q.id === destQueueId));
  }, [destQueue, users]);

  const getGroupLabel = (key: string, items: PainelTicket[]): { name: string; isPending: boolean } => {
    if (viewType === "U") {
      const userName = items[0]?.user?.name;
      return { name: userName || t("pending"), isPending: !userName };
    }
    if (viewType === "C") {
      const channel = whatsapps.find((w) => w.id === Number(key));
      return { name: channel?.name || t("noChannel"), isPending: !channel };
    }
    const queue = queues.find((q) => q.id === Number(key));
    return { name: queue?.queue || t("noQueue"), isPending: !queue };
  };

  const countStatus = (items: PainelTicket[]) => ({
    open: items.filter((t) => t.status === "open").length,
    pending: items.filter((t) => t.status === "pending").length,
  });

  const connectedChannels = useMemo(
    () =>
      whatsapps.filter(
        (w) => (w.status === "CONNECTED" || w.status === "OPENING") && !w.isDeleted
      ),
    [whatsapps]
  );

  // Lookup O(1) para resolver nome do canal a partir do whatsappId no card do ticket.
  // Sem isso teria que filtrar whatsapps array em cada render de ticket.
  const whatsappById = useMemo(() => {
    const map = new Map<number, WhatsappChannel>();
    whatsapps.forEach((w) => map.set(w.id, w));
    return map;
  }, [whatsapps]);

  const handleCloseByStatus = async (status: string) => {
    setActionLoading(true);
    setProgressPhase("fetching");
    setProgressCurrent(0);
    setProgressTotal(0);
    try {
      // Buscar TODOS os tickets do tenant com o status alvo, ignorando o filtro de data do painel.
      // O painel usa /dash-tickets-queues que recorta por dateStart/dateEnd; "fechar todos os abertos"
      // deve atuar em todos os tickets ainda abertos/pendentes do tenant, não só os visíveis.
      const allMatching: Array<{ id: number; userId: number | null; queueId: number | null }> = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        try {
          const { data } = await api.get<{ tickets: Array<{ id: number; userId: number | null; queueId: number | null }>; hasMore: boolean }>(
            "/tickets-frontnovo",
            { params: { searchParam: "", pageNumber: page, status: [status], showAll: true } }
          );
          const list = Array.isArray(data?.tickets) ? data.tickets : [];
          allMatching.push(...list);
          hasMore = !!data?.hasMore && list.length > 0;
          page += 1;
          if (page > 200) break; // guarda contra loop
        } catch {
          hasMore = false;
        }
      }

      setProgressPhase("processing");
      setProgressTotal(allMatching.length);
      setProgressCurrent(0);

      for (let i = 0; i < allMatching.length; i += 10) {
        const batch = allMatching.slice(i, i + 10);
        await Promise.all(
          batch.map((t) =>
            updateTicket(t.id, {
              userId: t.userId,
              queueId: t.queueId,
              status: "closed",
              isTransference: 1,
              skipFarewell: skipFarewellBulk,
            })
              .catch(() => {})
              .finally(() => setProgressCurrent((p) => p + 1))
          )
        );
      }
      setTimeout(() => consultarTickets({ silent: true }), 500);
    } finally {
      setActionLoading(false);
      resetProgress();
      setClosePendingOpen(false);
      setCloseOpenOpen(false);
    }
  };

  // Monta o conjunto exato que o encerramento por periodo vai fechar.
  // Busca o universo COMPLETO de abertos+pendentes do escopo (sem datas, igual ao
  // modo Ao Vivo) e recorta localmente. Nao reaproveita a lista ja na tela porque no
  // modo Periodo ela veio filtrada por createdAt pelo backend — recortar aquilo por
  // lastMessageAt deixaria de fora ticket cuja ultima mensagem cai na janela mas cuja
  // abertura nao cai.
  const loadPeriodCandidates = useCallback(async () => {
    setPeriodLoading(true);
    try {
      const { data } = await fetchPainelTickets({ showAll, _: Date.now() });
      const list = Array.isArray(data) ? data : [];
      const from = startOfDay(parseISO(dateStart)).getTime();
      const to = endOfDay(parseISO(dateEnd)).getTime();
      setPeriodCandidates(
        list.filter(ticket => {
          const raw = periodDateField === "createdAt" ? ticket.createdAt : ticket.lastMessageAt;
          const ms = toEpochMs(raw);
          // Sem data utilizavel o ticket nao pode ser situado na janela: fica de fora.
          if (ms === null) return false;
          return ms >= from && ms <= to;
        })
      );
    } catch {
      setPeriodCandidates([]);
    } finally {
      setPeriodLoading(false);
    }
  }, [showAll, dateStart, dateEnd, periodDateField]);

  // Recarrega ao abrir o dialog e a cada troca de criterio de data.
  useEffect(() => {
    if (closePeriodOpen && !isRealtime) {
      loadPeriodCandidates();
    } else if (!closePeriodOpen) {
      setPeriodCandidates([]);
      setPeriodLoading(false);
    }
  }, [closePeriodOpen, isRealtime, loadPeriodCandidates]);

  const periodBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    periodCandidates.forEach(ticket => {
      const name =
        (ticket.whatsappId ? whatsappById.get(ticket.whatsappId)?.name : null) || t("noChannel");
      counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [periodCandidates, whatsappById, t]);

  const periodStatusCounts = useMemo(() => ({
    open: periodCandidates.filter(ticket => ticket.status === "open").length,
    pending: periodCandidates.filter(ticket => ticket.status === "pending").length,
  }), [periodCandidates]);

  const handleClosePeriod = async () => {
    if (periodCandidates.length === 0) return;
    const targets = [...periodCandidates];
    setActionLoading(true);
    setProgressPhase("processing");
    setProgressTotal(targets.length);
    setProgressCurrent(0);
    try {
      for (let i = 0; i < targets.length; i += 10) {
        const batch = targets.slice(i, i + 10);
        await Promise.all(
          batch.map(ticket =>
            updateTicket(ticket.id, {
              userId: ticket.userId,
              queueId: ticket.queueId,
              status: "closed",
              isTransference: 1,
              // Encerramento por periodo e SEMPRE silencioso: fechar historico nao
              // pode virar disparo de mensagem para contato de semanas atras.
              skipFarewell: true,
            })
              .catch(() => {})
              .finally(() => setProgressCurrent(p => p + 1))
          )
        );
      }
      setTimeout(() => consultarTickets({ silent: true }), 500);
    } finally {
      setActionLoading(false);
      resetProgress();
      setClosePeriodOpen(false);
    }
  };

  // "Atender" pelo painel = assumir o ticket e abrir o atendimento. Split em
  // atenderTicketNow (ação crua) + handleAtenderTicket (pré-check de duplicidade),
  // no mesmo padrão de /atendimento.
  const atenderTicketNow = async (ticket: PainelTicket, ownerId?: number | null) => {
    try {
      await updateTicket(ticket.id, { status: "open", userId: ownerId ?? userId ?? ticket.userId });
      consultarTickets();
      router.push(`/atendimento?ticketId=${ticket.id}`);
    } catch { /* silent */ }
  };

  // Avisa quando o contato JÁ tem atendimento aberto que essa ação duplicaria:
  // no MESMO canal (checado sempre — caso clássico do ticket fechado que seria
  // reaberto tendo outro em curso) ou em OUTRO canal (gated pela flag do tenant).
  // Best-effort: falha do check nunca bloqueia o atender.
  const handleAtenderTicket = async (ticket: PainelTicket, ownerId?: number | null) => {
    if (ticket.contact?.number) {
      const cross = await findCrossChannelSiblingForTicket({
        ticketId: ticket.id,
        number: ticket.contact.number,
        whatsappId: ticket.whatsappId,
        includeSameChannel: ticket.status === "closed",
      });
      if (cross) {
        setAtenderCrossTicket(cross);
        setAtenderTargetTicket(ticket);
        return;
      }
    }
    await atenderTicketNow(ticket, ownerId);
  };

  const handleTransferNoQueue = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    const targets = tickets.filter((t) => t.queueId === null);
    setProgressPhase("transferring");
    setProgressTotal(targets.length);
    setProgressCurrent(0);
    try {
      for (const ticket of targets) {
        try {
          await updateTicket(ticket.id, {
            userId: Number(selectedUser),
            queueId: selectedQueue ? Number(selectedQueue) : null,
            status: ticket.status,
            isTransference: 1,
          });
        } catch { /* silent */ } finally {
          setProgressCurrent((p) => p + 1);
        }
      }
      setTimeout(() => consultarTickets({ silent: true }), 500);
    } finally {
      setActionLoading(false);
      resetProgress();
      setTransferQueueOpen(false);
    }
  };

  const handleTransferBetweenUsers = async () => {
    if (!sourceUser || !destUser) return;
    setActionLoading(true);
    const targets = tickets.filter((t) => t.userId === Number(sourceUser));
    setProgressPhase("transferring");
    setProgressTotal(targets.length);
    setProgressCurrent(0);
    try {
      for (const ticket of targets) {
        try {
          await updateTicket(ticket.id, {
            userId: Number(destUser),
            queueId: ticket.queueId,
            status: ticket.status,
            isTransference: 1,
          });
        } catch { /* silent */ } finally {
          setProgressCurrent((p) => p + 1);
        }
      }
      setTimeout(() => consultarTickets({ silent: true }), 500);
    } finally {
      setActionLoading(false);
      resetProgress();
      setTransferUserOpen(false);
    }
  };

  const handleTransferQueues = async () => {
    if (!destQueue) return;
    if (conflictResolution === "assign" && conflictingTickets.length > 0 && !destUserForQueue && !conflictAssignUser) return;
    setActionLoading(true);
    try {
      const destQueueId = Number(destQueue);
      const srcQueueId = sourceQueue ? Number(sourceQueue) : null;
      const conflictSet = new Set(conflictingTickets.map(t => t.id));
      const conflictUserId = conflictResolution === "assign" && conflictAssignUser
        ? Number(conflictAssignUser)
        : null;

      const sourceTickets = tickets.filter(t =>
        srcQueueId === null ? !t.queueId : t.queueId === srcQueueId
      );

      setProgressPhase("transferring");
      setProgressTotal(sourceTickets.length);
      setProgressCurrent(0);

      for (let i = 0; i < sourceTickets.length; i += 10) {
        const batch = sourceTickets.slice(i, i + 10);
        await Promise.all(batch.map(t => {
          let uid: number | null;
          if (destUserForQueue) {
            uid = Number(destUserForQueue);
          } else if (conflictSet.has(t.id)) {
            uid = conflictUserId;
          } else {
            uid = t.userId;
          }
          return updateTicket(t.id, {
            queueId: destQueueId,
            userId: uid,
            status: t.status,
            isTransference: 1,
          })
            .catch(() => {})
            .finally(() => setProgressCurrent((p) => p + 1));
        }));
      }

      setTimeout(() => consultarTickets({ silent: true }), 500);
    } finally {
      setActionLoading(false);
      resetProgress();
      setTransferBetweenQueuesOpen(false);
      setConflictResolution("pending");
      setConflictAssignUser("");
    }
  };

  const handleTransferChannels = async () => {
    if (!sourceChannel || !destChannel) return;
    const src = connectedChannels.find((c) => String(c.id) === sourceChannel);
    const dst = connectedChannels.find((c) => String(c.id) === destChannel);
    if (!src || !dst) return;
    setActionLoading(true);
    setProgressPhase("transferring");
    setProgressTotal(0);
    setProgressCurrent(0);
    try {
      await transferBetweenChannels({
        sourceChannel: src.type,
        sourceWhatsappId: src.id,
        destinationChannel: dst.type,
        destinationWhatsappId: dst.id,
      });
      setTimeout(() => consultarTickets({ silent: true }), 500);
    } finally {
      setActionLoading(false);
      resetProgress();
      setTransferBetweenChannelsOpen(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllAsRead();
      setTimeout(() => consultarTickets({ silent: true }), 500);
    } catch { /* silent */ }
  };

  const renderPreviewCount = () => (
    <div className="space-y-2 rounded-md border bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground">{t("foundCount")}:</span>
        {previewLoading ? (
          <Skeleton className="h-4 w-10" />
        ) : (
          <span className="font-semibold tabular-nums">{previewCount ?? 0}</span>
        )}
      </div>
      {!previewLoading && previewBreakdown.length > 0 && (
        <div className="pt-1 border-t border-border/50">
          <div className="text-xs text-muted-foreground mb-1.5">{t("byChannelLabel")}</div>
          <div className="flex flex-wrap gap-1.5">
            {previewBreakdown.map((row, i) => (
              <Badge
                key={`${row.whatsappId ?? "null"}-${i}`}
                variant="outline"
                className="text-[11px] font-normal flex items-center gap-1"
              >
                <span className="truncate max-w-[160px]">
                  {row.whatsappName || t("noChannel")}
                </span>
                <span className="tabular-nums font-semibold">{row.count}</span>
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // Toggle de despedida, reutilizado nos dois dialogs de Resolver. Ligado = ninguem
  // recebe mensagem (padrao). Desligado = comportamento antigo, com aviso do volume.
  const renderFarewellToggle = () => (
    <div className="space-y-2 rounded-md border bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-2">
        <Switch
          id="bulk-skip-farewell"
          checked={skipFarewellBulk}
          onCheckedChange={setSkipFarewellBulk}
          disabled={actionLoading}
        />
        <Label htmlFor="bulk-skip-farewell" className="text-sm cursor-pointer">
          {t("bulkSkipFarewellLabel")}
        </Label>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {skipFarewellBulk ? t("bulkSkipFarewellOnNote") : t("bulkSkipFarewellOffNote")}
      </p>
      {!skipFarewellBulk && !previewLoading && (previewCount ?? 0) > 0 && (
        <div className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            {t("bulkFarewellWarning", { count: previewCount ?? 0 })}
          </p>
        </div>
      )}
    </div>
  );

  // Bloco de progresso reutilizado em todos os dialogs de ação em massa.
  // - Quando total > 0: barra determinística "{label}: {current}/{total}"
  // - Quando total === 0 (chamada única ou ainda buscando): barra indeterminada com pulse
  const renderProgressBlock = () => {
    if (!actionLoading || !progressPhase) return null;
    const label = progressPhase === "fetching"
      ? t("fetching")
      : progressPhase === "transferring"
        ? t("transferring")
        : t("processing");
    const determinate = progressTotal > 0;
    const pct = determinate ? Math.min(100, Math.round((progressCurrent / progressTotal) * 100)) : 0;
    return (
      <div className="space-y-2 py-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          {determinate && <span className="tabular-nums">{progressCurrent}/{progressTotal}</span>}
        </div>
        {determinate ? (
          <Progress value={pct} />
        ) : (
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-primary/20">
            <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-primary animate-pulse" />
          </div>
        )}
      </div>
    );
  };

  // Guard de acesso APOS todos os hooks (Rules of Hooks): `allowed` pode mudar em
  // runtime (refresh de perfil a cada 30s / chegada de planFeatures), entao o
  // early-return nao pode vir antes dos hooks — senao a contagem de hooks diverge
  // entre renders e a arvore quebra.
  if (!allowed) return <AccessDenied />;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <PageHeader
            title={t("title")}
            description={t("description")}
            help={{
              description: t("helpDesc"),
              sections: [
                { title: t("helpLiveT"), items: [t("helpLiveI0"), t("helpLiveI1"), t("helpLiveI2")] },
                { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
                { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2"), t("helpS1I3")] },
                { title: t("helpPeriodT"), items: [t("helpPeriodI0"), t("helpPeriodI1"), t("helpPeriodI2")] },
                { title: t("helpQueueT"), items: [t("helpQueueI0"), t("helpQueueI1"), t("helpQueueI2")] },
              ],
            }}
          />

          <div className="flex items-center gap-2 flex-wrap">
            {/* Status do modo Ao Vivo + toggle + atualizar agora */}
            <div className="flex items-center gap-2 mr-1" role="status" aria-live="polite">
              {(() => {
                if (!isRealtime) {
                  return (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-label={t("livePaused")}>
                      <CalendarClock className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{t("livePaused")}</span>
                    </span>
                  );
                }
                if (liveReconnecting || !liveConnected) {
                  return (
                    <span className="flex items-center gap-1.5 text-xs text-amber-500" aria-label={t("liveReconnecting")}>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span className="hidden sm:inline">{t("liveReconnecting")}</span>
                    </span>
                  );
                }
                return (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-500" aria-label={t("liveOn")}>
                    <span className="relative flex h-2 w-2">
                      <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <span className="hidden sm:inline">{t("liveOn")}</span>
                  </span>
                );
              })()}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Switch
                      checked={isRealtime}
                      onCheckedChange={(v) => (v ? enterRealtime() : enterPeriod())}
                      aria-label={t("liveToggleAria")}
                    />
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">{t("liveTooltip")}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={() => forceReload()} aria-label={t("refreshNow")}>
                    <RotateCw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("refreshNow")}</TooltipContent>
              </Tooltip>
            </div>

            {isAdmin && (
              <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={() => setCloseOpenOpen(true)}>
                  <MessageSquare className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("tooltipCloseOpen")}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={() => setClosePendingOpen(true)}>
                  <Clock className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("tooltipClosePending")}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={() => setClosePeriodOpen(true)}>
                  <CalendarCheck className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("tooltipClosePeriod")}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={async () => { await loadAllUsers(); setTransferUserOpen(true); }}>
                  <ArrowRightLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("tooltipTransferUsers")}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={async () => { await loadAllUsers(); setTransferBetweenQueuesOpen(true); }}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("tooltipTransferQueues")}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={() => setTransferBetweenChannelsOpen(true)}>
                  <ArrowRightLeft className="h-4 w-4 rotate-90" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("tooltipTransferChannels")}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={handleMarkAllRead}>
                  <Mail className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("tooltipMarkAllRead")}</TooltipContent>
            </Tooltip>
              </>
            )}

            <Button variant="outline" onClick={() => setFiltersOpen(true)}>
              <Filter className="h-4 w-4 mr-2" /> {t("filters")}
            </Button>
          </div>
        </div>

        {!isAdmin && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-muted-foreground">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
            <span>{t("supervisorScopeNote")}</span>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-blue-500" /> {t("totalOpen")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{loading ? <Skeleton className="h-9 w-16" /> : totalOpen}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" /> {t("pending")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{loading ? <Skeleton className="h-9 w-16" /> : totalPending}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4 text-emerald-500" /> {t("totalTickets")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{loading ? <Skeleton className="h-9 w-16" /> : totalTickets}</div>
            </CardContent>
          </Card>
        </div>

        {/* Ticket Groups */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[380px]" />
            ))}
          </div>
        ) : totalTickets === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <CheckCheck className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-lg font-medium">{isRealtime ? t("noTicketsLive") : t("noTickets")}</p>
              <p className="text-sm">{isRealtime ? t("noTicketsLiveDesc") : t("noTicketsDesc")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {grouped.map(([key, items]) => {
              const { name, isPending } = getGroupLabel(key, items);
              const counts = countStatus(items);
              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="min-w-0 overflow-hidden"
                >
                  <Card className="h-[380px] flex flex-col min-w-0 overflow-hidden">
                    <CardHeader className={`pb-2 ${isPending ? "bg-destructive/10 dark:bg-destructive/20" : ""}`}>
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                          isPending ? "bg-destructive/20 text-destructive" : "bg-primary/10 text-primary"
                        }`}>
                          {viewType === "U" ? <UserIcon className="h-5 w-5" /> : viewType === "C" ? <Wifi className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-sm font-semibold truncate">{name}</CardTitle>
                          <div className="flex gap-2 mt-1">
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {t("open")}: {counts.open}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {t("pending")}: {counts.pending}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {t("total")}: {items.length}
                            </Badge>
                          </div>
                        </div>
                        {isAdmin && isPending && viewType === "F" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              await loadAllUsers();
                              setTransferQueueOpen(true);
                            }}
                          >
                            <ArrowRightLeft className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <Separator />
                    <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
                      <div className="p-3 space-y-2">
                        {items.map((ticket) => (
                          <div
                            key={ticket.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => router.push(`/atendimento?ticketId=${ticket.id}`)}
                            onKeyDown={(e) => e.key === "Enter" && router.push(`/atendimento?ticketId=${ticket.id}`)}
                            className={cn(
                              "relative flex items-center gap-2 rounded-lg border p-2.5 hover:bg-muted/50 transition-colors cursor-pointer",
                              recentIds.has(ticket.id) && "ring-2 ring-amber-400/70 border-amber-400/50 motion-safe:animate-pulse"
                            )}
                          >
                            {recentIds.has(ticket.id) && (
                              <span className="absolute -top-1.5 -right-1.5 z-10 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-white shadow">
                                {t("newBadge")}
                              </span>
                            )}
                            <div className={cn("flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-bold shrink-0", isLiveMode && "live-blur")}>
                              {ticket.contact?.name?.charAt(0)?.toUpperCase() || "#"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={cn("text-sm font-medium truncate", isLiveMode && "live-blur-text")}>
                                  {ticket.contact?.name || `#${ticket.id}`}
                                </span>
                                {ticket.unreadMessages > 0 && (
                                  <Badge className="text-[10px] px-1 py-0 h-4 bg-emerald-500">
                                    {ticket.unreadMessages}
                                  </Badge>
                                )}
                              </div>
                              <p className={cn("text-xs text-muted-foreground truncate", isLiveMode && "live-blur-text")}>
                                {getTicketListPreview(ticket.lastMessage, (ticket as any).lastMessageType, tAtd)}
                              </p>
                              <p className="text-[10px] text-muted-foreground/70 truncate flex items-center gap-0.5 mt-0.5">
                                <UserIcon className="h-2.5 w-2.5 shrink-0" />
                                {ticket.user?.name || t("unassigned")}
                              </p>
                              {/* Fila e Canal sempre visíveis no card — espelha comportamento do painel Vue legado.
                                  Os clientes usam essas infos pra decidir distribuição de pendentes mesmo
                                  quando agrupados por usuário. */}
                              <div className="flex gap-1 mt-1 flex-wrap">
                                {(() => {
                                  // Resolve fila pelo objeto do ticket; se vier "magro" (so queueId),
                                  // completa pela lista de filas carregada do tenant. Evita "Sem fila"
                                  // no card apesar do queueId estar gravado no banco.
                                  const fallbackQueue = ticket.queueId != null ? queues.find((q) => q.id === ticket.queueId) : undefined;
                                  const qName = ticket.queue?.queue || fallbackQueue?.queue;
                                  const qColor = ticket.queue?.color || fallbackQueue?.color || "#64748b";
                                  return qName ? (
                                    <Badge
                                      variant="secondary"
                                      className="text-[9px] h-4 px-1 leading-none border-0 text-white"
                                      style={{ backgroundColor: qColor }}
                                    >
                                      {qName}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[9px] h-4 px-1 leading-none">
                                      {t("noQueue")}
                                    </Badge>
                                  );
                                })()}
                                {ticket.whatsappId ? (
                                  <Badge variant="outline" className="text-[9px] h-4 px-1 leading-none">
                                    {whatsappById.get(ticket.whatsappId)?.name || `#${ticket.whatsappId}`}
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0 ml-1">
                              <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                                {ticket.status === "pending" && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => { void handleAtenderTicket(ticket); }}
                                      >
                                        <LogIn className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>{t("attend")}</TooltipContent>
                                  </Tooltip>
                                )}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      onClick={() => { setSpyTicket(ticket); setSpyOpen(true); }}
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>{t("spyConversation")}</TooltipContent>
                                </Tooltip>
                              </div>
                              <Badge
                                variant={ticket.status === "open" ? "default" : ticket.status === "pending" ? "secondary" : "outline"}
                                className="text-[10px] px-1.5 py-0"
                              >
                                {ticket.status === "open" ? t("open") : ticket.status === "pending" ? t("pending") : t("closed")}
                              </Badge>
                              <span className="flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground">#{ticket.id}</span>
                                <span className={`text-[10px] ${timeAgoColor(ticket.updatedAt)}`}>{timeAgo(ticket.updatedAt, tAtd("now"))}</span>
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Filters Dialog */}
        <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("filters")}</DialogTitle>
              <DialogDescription>{t("filtersDescription")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                  {t("periodTitle")}
                </div>
                <p className="text-[11px] text-muted-foreground">{t("periodNote")}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t("dateStart")}</Label>
                  <Input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
                </div>
                <div>
                  <Label>{t("dateEnd")}</Label>
                  <Input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
                </div>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <Switch checked={showAll} onCheckedChange={setShowAll} />
                  <Label>{t("showAll")}</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs text-xs">
                      <p className="font-medium mb-1">{t("showAllTooltipTitle")}</p>
                      <p>{t("showAllTooltipBody")}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}
              <div>
                <Label>{t("viewType")}</Label>
                <Select value={viewType} onValueChange={(v) => setViewType(v as ViewType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="U">{t("byUser")}</SelectItem>
                    <SelectItem value="F">{t("byQueue")}</SelectItem>
                    <SelectItem value="C">{t("byChannel")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              {!isRealtime && (
                <Button variant="ghost" onClick={() => { enterRealtime(); setFiltersOpen(false); }}>
                  <Radio className="h-4 w-4 mr-2" /> {t("backToLive")}
                </Button>
              )}
              <Button onClick={() => { enterPeriod(); setFiltersOpen(false); }}>
                <CalendarClock className="h-4 w-4 mr-2" /> {t("applyPeriod")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Close Open Tickets Dialog */}
        <Dialog open={closeOpenOpen} onOpenChange={(open) => { if (!actionLoading) setCloseOpenOpen(open); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("resolveOpenTitle")}</DialogTitle>
              <DialogDescription>{t("resolveOpenDesc")}</DialogDescription>
            </DialogHeader>
            {renderPreviewCount()}
            {renderFarewellToggle()}
            {renderProgressBlock()}
            <DialogFooter>
              <Button variant="outline" disabled={actionLoading} onClick={() => setCloseOpenOpen(false)}>{t("cancel")}</Button>
              <Button
                disabled={actionLoading || previewLoading || previewCount === 0}
                onClick={() => handleCloseByStatus("open")}
              >
                {actionLoading ? t("processing") : t("resolve")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Close Pending Tickets Dialog */}
        <Dialog open={closePendingOpen} onOpenChange={(open) => { if (!actionLoading) setClosePendingOpen(open); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("resolvePendingTitle")}</DialogTitle>
              <DialogDescription>{t("resolvePendingDesc")}</DialogDescription>
            </DialogHeader>
            {renderPreviewCount()}
            {renderFarewellToggle()}
            {renderProgressBlock()}
            <DialogFooter>
              <Button variant="outline" disabled={actionLoading} onClick={() => setClosePendingOpen(false)}>{t("cancel")}</Button>
              <Button
                disabled={actionLoading || previewLoading || previewCount === 0}
                onClick={() => handleCloseByStatus("pending")}
              >
                {actionLoading ? t("processing") : t("resolve")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Close Tickets By Period Dialog */}
        <Dialog open={closePeriodOpen} onOpenChange={(open) => { if (!actionLoading) setClosePeriodOpen(open); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("closePeriodTitle")}</DialogTitle>
              <DialogDescription>{t("closePeriodDesc")}</DialogDescription>
            </DialogHeader>

            {isRealtime ? (
              // Sem periodo aplicado nao ha o que recortar. Em vez de esconder o botao
              // (que ficaria indescobrivel), explica e oferece o caminho.
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                <Info className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-600 dark:text-amber-400">{t("closePeriodNeedsPeriod")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-md border bg-muted/30 px-3 py-2 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                    {t("closePeriodRangeLabel")}
                  </div>
                  <p className="text-sm font-semibold tabular-nums">
                    {format(parseISO(dateStart), "dd/MM/yyyy")} — {format(parseISO(dateEnd), "dd/MM/yyyy")}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">{t("closePeriodDateFieldLabel")}</Label>
                  <Select
                    value={periodDateField}
                    onValueChange={(v) => setPeriodDateField(v as "createdAt" | "lastMessageAt")}
                    disabled={actionLoading}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="createdAt">{t("closePeriodByCreatedAt")}</SelectItem>
                      <SelectItem value="lastMessageAt">{t("closePeriodByLastMessage")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    {periodDateField === "createdAt"
                      ? t("closePeriodByCreatedAtNote")
                      : t("closePeriodByLastMessageNote")}
                  </p>
                </div>

                <div className="space-y-2 rounded-md border bg-muted/30 px-3 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">{t("foundCount")}:</span>
                    {periodLoading ? (
                      <Skeleton className="h-4 w-10" />
                    ) : (
                      <span className="font-semibold tabular-nums">{periodCandidates.length}</span>
                    )}
                  </div>
                  {!periodLoading && periodCandidates.length > 0 && (
                    <>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-[11px] font-normal">
                          {t("open")} <span className="ml-1 tabular-nums font-semibold">{periodStatusCounts.open}</span>
                        </Badge>
                        <Badge variant="outline" className="text-[11px] font-normal">
                          {t("pending")} <span className="ml-1 tabular-nums font-semibold">{periodStatusCounts.pending}</span>
                        </Badge>
                      </div>
                      <div className="pt-1 border-t border-border/50">
                        <div className="text-xs text-muted-foreground mb-1.5">{t("byChannelLabel")}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {periodBreakdown.map((row, i) => (
                            <Badge
                              key={`${row.name}-${i}`}
                              variant="outline"
                              className="text-[11px] font-normal flex items-center gap-1"
                            >
                              <span className="truncate max-w-[160px]">{row.name}</span>
                              <span className="tabular-nums font-semibold">{row.count}</span>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex items-start gap-1.5 rounded-md border bg-muted/30 px-3 py-2">
                  <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-[11px] text-muted-foreground">{t("closePeriodSilentNote")}</p>
                </div>
              </div>
            )}

            {renderProgressBlock()}

            <DialogFooter>
              <Button variant="outline" disabled={actionLoading} onClick={() => setClosePeriodOpen(false)}>
                {t("cancel")}
              </Button>
              {isRealtime ? (
                <Button onClick={() => { setClosePeriodOpen(false); setFiltersOpen(true); }}>
                  <CalendarClock className="h-4 w-4 mr-2" /> {t("closePeriodOpenFilters")}
                </Button>
              ) : (
                <Button
                  disabled={actionLoading || periodLoading || periodCandidates.length === 0}
                  onClick={handleClosePeriod}
                >
                  {actionLoading ? t("processing") : t("resolve")}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Transfer No-Queue Tickets Dialog */}
        <Dialog open={transferQueueOpen} onOpenChange={setTransferQueueOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("transferNoQueueTitle")}</DialogTitle>
              <DialogDescription>{t("transferNoQueueDesc")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t("destQueue")}</Label>
                <Select value={selectedQueue} onValueChange={setSelectedQueue}>
                  <SelectTrigger><SelectValue placeholder={t("select")} /></SelectTrigger>
                  <SelectContent>
                    {queues.filter((q) => q.isActive !== false).map((q) => (
                      <SelectItem key={q.id} value={String(q.id)}>{q.queue}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("destUser")}</Label>
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger><SelectValue placeholder={t("select")} /></SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {renderProgressBlock()}
            <DialogFooter>
              <Button variant="outline" disabled={actionLoading} onClick={() => setTransferQueueOpen(false)}>{t("cancel")}</Button>
              <Button disabled={actionLoading} onClick={handleTransferNoQueue}>
                {actionLoading ? t("transferring") : t("transfer")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Transfer Between Users Dialog */}
        <Dialog open={transferUserOpen} onOpenChange={setTransferUserOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("transferUsersTitle")}</DialogTitle>
              <DialogDescription>{t("transferUsersDesc")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t("sourceUser")}</Label>
                <Select value={sourceUser} onValueChange={setSourceUser}>
                  <SelectTrigger><SelectValue placeholder={t("select")} /></SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("destUser")}</Label>
                <Select value={destUser} onValueChange={setDestUser}>
                  <SelectTrigger><SelectValue placeholder={t("select")} /></SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {renderProgressBlock()}
            <DialogFooter>
              <Button variant="outline" disabled={actionLoading} onClick={() => setTransferUserOpen(false)}>{t("cancel")}</Button>
              <Button disabled={actionLoading} onClick={handleTransferBetweenUsers}>
                {actionLoading ? t("transferring") : t("transfer")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Transfer Between Queues Dialog */}
        <Dialog open={transferBetweenQueuesOpen} onOpenChange={(open) => {
          setTransferBetweenQueuesOpen(open);
          if (!open) { setConflictResolution("pending"); setConflictAssignUser(""); }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("transferQueuesTitle")}</DialogTitle>
              <DialogDescription>{t("transferQueuesDesc")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t("sourceQueue")}</Label>
                <Select value={sourceQueue} onValueChange={(v) => { setSourceQueue(v); setConflictResolution("pending"); setConflictAssignUser(""); }}>
                  <SelectTrigger><SelectValue placeholder={t("noQueueAll")} /></SelectTrigger>
                  <SelectContent>
                    {queues.map((q) => (
                      <SelectItem key={q.id} value={String(q.id)}>{q.queue}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("destQueue")} *</Label>
                <Select value={destQueue} onValueChange={(v) => { setDestQueue(v); setConflictResolution("pending"); setConflictAssignUser(""); }}>
                  <SelectTrigger><SelectValue placeholder={t("select")} /></SelectTrigger>
                  <SelectContent>
                    {queues.filter((q) => q.isActive !== false).map((q) => (
                      <SelectItem key={q.id} value={String(q.id)}>{q.queue}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {conflictingTickets.length > 0 && !destUserForQueue && (
                <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      <span className="font-semibold">{conflictingTickets.length}</span>{" "}
                      {t("conflictTicketsWarning")}
                    </p>
                  </div>
                  <RadioGroup
                    value={conflictResolution}
                    onValueChange={(v) => { setConflictResolution(v as "pending" | "assign"); setConflictAssignUser(""); }}
                    className="space-y-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="pending" id="cr-pending" />
                      <Label htmlFor="cr-pending" className="font-normal cursor-pointer">
                        {t("conflictMakePending")}
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="assign" id="cr-assign" />
                      <Label htmlFor="cr-assign" className="font-normal cursor-pointer">
                        {t("conflictAssignTo")}
                      </Label>
                    </div>
                  </RadioGroup>
                  {conflictResolution === "assign" && (
                    <Select value={conflictAssignUser} onValueChange={setConflictAssignUser}>
                      <SelectTrigger><SelectValue placeholder={t("select")} /></SelectTrigger>
                      <SelectContent>
                        {usersInDestQueue.length > 0
                          ? usersInDestQueue.map((u) => (
                              <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                            ))
                          : users.map((u) => (
                              <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                            ))
                        }
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              <div>
                <Label>{t("destUserOptional")}</Label>
                <Select value={destUserForQueue} onValueChange={setDestUserForQueue}>
                  <SelectTrigger><SelectValue placeholder={t("keepCurrent")} /></SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {renderProgressBlock()}
            <DialogFooter>
              <Button variant="outline" disabled={actionLoading} onClick={() => setTransferBetweenQueuesOpen(false)}>{t("cancel")}</Button>
              <Button
                disabled={
                  actionLoading ||
                  (conflictResolution === "assign" && conflictingTickets.length > 0 && !destUserForQueue && !conflictAssignUser)
                }
                onClick={handleTransferQueues}
              >
                {actionLoading ? t("transferring") : t("transfer")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Transfer Between Channels Dialog */}
        <Dialog open={transferBetweenChannelsOpen} onOpenChange={setTransferBetweenChannelsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("transferChannelsTitle")}</DialogTitle>
              <DialogDescription>{t("transferChannelsDesc")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t("sourceChannel")} *</Label>
                <Select value={sourceChannel} onValueChange={setSourceChannel}>
                  <SelectTrigger><SelectValue placeholder={t("select")} /></SelectTrigger>
                  <SelectContent>
                    {connectedChannels.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name} ({c.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("destChannel")} *</Label>
                <Select value={destChannel} onValueChange={setDestChannel}>
                  <SelectTrigger><SelectValue placeholder={t("select")} /></SelectTrigger>
                  <SelectContent>
                    {connectedChannels.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name} ({c.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {renderProgressBlock()}
            <DialogFooter>
              <Button variant="outline" disabled={actionLoading} onClick={() => setTransferBetweenChannelsOpen(false)}>{t("cancel")}</Button>
              <Button disabled={actionLoading} onClick={handleTransferChannels}>
                {actionLoading ? t("transferring") : t("transfer")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <EspiarConversaDialog
          open={spyOpen}
          onOpenChange={(open) => { setSpyOpen(open); if (!open) setSpyTicket(null); }}
          ticket={spyTicket ? { id: spyTicket.id, contact: spyTicket.contact, status: spyTicket.status } : null}
          onAtender={async (t) => {
            if (!t || !userId) return;
            // O dialog devolve um recorte do ticket; recupera o PainelTicket completo
            // (precisa de whatsappId para o pré-check de duplicidade).
            const full = spyTicket && spyTicket.id === t.id ? spyTicket : null;
            setSpyOpen(false);
            setSpyTicket(null);
            if (full) {
              await handleAtenderTicket(full, userId);
              return;
            }
            try {
              await updateTicket(t.id, { status: "open", userId });
              consultarTickets();
              router.push(`/atendimento?ticketId=${t.id}`);
            } catch { /* silent */ }
          }}
        />

        {/* Aviso de atendimento duplicado ao "Atender" pelo painel: reusa o dialog
            compartilhado. O painel só oferece Atender para ticket PENDENTE, então o
            fluxo aqui é sempre o de aceite. Se um dia ele passar a reabrir fechados,
            esse caminho tem diálogo próprio (reopen-confirm-dialog), que também
            avisa do destino da posse e da janela de 24h. */}
        <ExistingTicketDialog
          open={!!atenderCrossTicket}
          onOpenChange={(o) => { if (!o) { setAtenderCrossTicket(null); setAtenderTargetTicket(null); } }}
          ticket={atenderCrossTicket}
          isRestrictedUser={isRestrictedUser()}
          notViewAssignedTickets={getConfigValue("NotViewAssignedTickets") === "enabled"}
          targetWhatsappId={atenderTargetTicket?.whatsappId ?? null}
          proceedMode="accept"
          onProceed={() => {
            const target = atenderTargetTicket;
            setAtenderCrossTicket(null);
            setAtenderTargetTicket(null);
            if (target) void atenderTicketNow(target);
          }}
        />
      </div>
    </TooltipProvider>
  );
}
