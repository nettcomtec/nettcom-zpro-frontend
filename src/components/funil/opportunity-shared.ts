// Tipos e funções do quadro de oportunidades usados pela página, pela ficha e pelo
// formulário (PLANO_FUNIL_OPORTUNIDADES_KOMMO 5.0-2). Página do Next só exporta o
// default, por isso moram aqui.

import { daysUntilClosing } from "@/lib/opportunity-date";
import type { UseRegionResult } from "@/hooks/use-region";
import { useAuthStore } from "@/stores/auth-store";
import { isNotViewAssignedRestricted } from "@/lib/not-view-assigned-scope";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface Pipeline {
  id: number;
  name: string;
  createdAt?: string;
  stages?: { id: number }[];
}
export interface Stage { id: number; name: string; pipelineId: number; color?: string; order?: number; }
export interface Responsible { label: string; value: number; }
export interface ContactOption { id: number; name: string; number?: string; email?: string; profilePicUrl?: string; }

/**
 * Atendimento open/pending do contato, escolhido pelo backend (include `activeTicket`):
 * o do próprio usuário, senão o de movimento mais recente. Nunca traz texto de mensagem.
 */
export interface OpportunityActiveTicket {
  id: number;
  status: "open" | "pending";
  userId: number | null;
  userName: string | null;
  userProfilePicture: string | null;
  unreadMessages: number;
  isGroup: boolean;
  /** Usuário é convidado/membro do grupo do atendimento (passa no guard mesmo sendo de outro dono) */
  viewerLinked: boolean;
  updatedAt: string;
}

export interface OpportunityContact {
  id: number;
  name: string;
  number?: string;
  email?: string;
  profilePicUrl?: string;
  kanban?: number | null;
  tags?: { id: number; tag?: string; name?: string; color?: string }[];
  wallets?: { id: number; name: string }[];
  kanbanInfo?: { id: number; name: string; color?: string } | null;
  telegramId?: string | null;
  instagramPK?: string | null;
  messengerId?: string | null;
  /** undefined = o backend não informou (antigo, kill-switch ou falha); null = sem atendimento ativo */
  activeTicket?: OpportunityActiveTicket | null;
  activeTicketCount?: number;
}

export interface Opportunity {
  id: number;
  name: string;
  value?: number;
  status: string;
  stageId: number;
  pipelineId: number;
  responsibleId?: number;
  contactId?: number;
  contact?: OpportunityContact;
  closingForecast?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Filters {
  pipelineId: number | null;
  stageId: number | null;
  responsibleId: number | null;
  status: string;
  valorMin: number | null;
  valorMax: number | null;
  dataInicio: string | null;
  dataFim: string | null;
  searchTerm: string;
  ordenacao: string;
  tagId: number | null;
  walletUserId: number | null;
  kanbanId: number | null;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
}

// ─── Formatação ──────────────────────────────────────────────────────────────

// Valor da oportunidade é gravado sem moeda: aparece na moeda e no formato do país da empresa.
export function formatValue(val: number | string | null | undefined, formatMoney: UseRegionResult["formatMoney"]) {
  const n = Number(val);
  return formatMoney(Number.isFinite(n) ? n : 0);
}

export function formatDateUTC(dateStr?: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

export function convertBRToISO(br: string) {
  if (!br) return "";
  const [d, m, y] = br.split("/");
  if (d && m && y) return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return "";
}

export function convertISOToBR(iso: string) {
  if (!iso) return "";
  const short = iso.split("T")[0];
  const [y, m, d] = short.split("-");
  if (y && m && d) return `${d}/${m}/${y}`;
  return "";
}

export function isUrgent(dateStr?: string) {
  const diffDays = daysUntilClosing(dateStr);
  if (diffDays === null) return false;
  return diffDays <= 7 && diffDays >= 0;
}

export function statusColor(status: string) {
  if (status === "open") return "bg-amber-400 text-white";
  if (status === "win") return "bg-green-500 text-white";
  if (status === "lose") return "bg-red-500 text-white";
  return "bg-gray-400 text-white";
}

export function statusLabel(status: string, t: (key: string) => string) {
  if (status === "open") return t("statusOpen");
  if (status === "win") return t("statusWin");
  if (status === "lose") return t("statusLose");
  return status;
}

// ─── Dados ───────────────────────────────────────────────────────────────────

/** Mesma normalização que o quadro sempre aplicou ao listar (o pg devolve DECIMAL como texto). */
export function normalizeOpportunity<T extends Partial<Opportunity>>(o: T): T {
  return {
    ...o,
    stageId: Number(o.stageId),
    pipelineId: Number(o.pipelineId),
    value: Number(o.value),
    status: o.status ? String(o.status).toLowerCase() : "",
  };
}

/**
 * Resposta do PUT/POST de oportunidade vem sem `contact`: mantém o contato (e o
 * atendimento ativo dele) que a tela já tinha.
 */
export function mergeOpportunity(prev: Opportunity, resp: Partial<Opportunity> | null | undefined): Opportunity {
  if (!resp) return prev;
  const { contact: _ignored, ...rest } = resp;
  return { ...prev, ...normalizeOpportunity(rest), contact: prev.contact };
}

/** Usuário restrito vê só as 5 primeiras letras do nome (mesmo corte do painel do atendimento). */
export function restrictedContactName(name: string | null | undefined, isRestricted: boolean): string {
  const raw = name ?? "";
  if (!isRestricted || raw.length <= 5) return raw;
  return `${raw.slice(0, 5)}...`;
}

/**
 * "Não ver atendimentos de outros" (NotViewAssignedTickets): o perfil restrito não abre
 * atendimento ativo de outro dono. Espelha o guard do backend (CanUserAccessTicketService):
 * sem dono ou convidado/membro do grupo passam. Restrito = atendente, supervisor com
 * "Remover privilégios" e personalizado sem "ver todos" (lib/not-view-assigned-scope).
 */
export function isBlockedByNotViewAssigned(args: {
  notViewOn: boolean;
  profile?: string | null;
  meId?: number | null;
  ticketUserId?: number | null;
  viewerLinked?: boolean;
}): boolean {
  const { notViewOn, profile, meId, ticketUserId, viewerLinked } = args;
  if (!notViewOn) return false;
  // Quem chama passa o perfil do usuário logado: o resto (supervisorAdmin, perfil de
  // acesso) vem do mesmo store. Perfil diferente do store = só o do argumento conta.
  const state = useAuthStore.getState();
  const viewer = state.user && state.user.profile === profile ? state.user : { profile };
  if (!isNotViewAssignedRestricted(viewer, state.supervisorAdmin)) return false;
  if (ticketUserId == null) return false;
  if (meId != null && Number(ticketUserId) === Number(meId)) return false;
  return !viewerLinked;
}

/**
 * Funil padrão do quadro: o mais antigo que tem etapas; nenhum com etapas → o mais antigo.
 * As etapas vêm do próprio funil (`GET /pipelines` traz `stages`) ou da lista de etapas.
 */
export function pickDefaultPipeline(pipelines: Pipeline[], stages: Stage[] = []): Pipeline | null {
  if (!pipelines.length) return null;
  const byAge = [...pipelines].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : Number.POSITIVE_INFINITY;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    return Number(a.id) - Number(b.id);
  });
  const hasStages = (p: Pipeline) =>
    (Array.isArray(p.stages) && p.stages.length > 0) ||
    stages.some((s) => Number(s.pipelineId) === Number(p.id));
  return byAge.find(hasStages) ?? byAge[0];
}
