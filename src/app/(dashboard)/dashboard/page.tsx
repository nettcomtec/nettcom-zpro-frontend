"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  MessageSquare, Clock, Users, Hourglass, MessageCircleReply, Timer, Phone, UserCheck, RefreshCw, Calendar,
  GripVertical, LayoutGrid, Check, Sparkles, Loader2, History, Trash2, Cpu,
  Eye, EyeOff, SlidersHorizontal, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import {
  generateDashboardInsights,
  listDashboardInsights,
  deleteDashboardInsight,
  type DashboardInsightHistoryRow,
} from "@/services/copilot";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/charts/stat-card";
import { PieChartCard } from "@/components/charts/pie-chart-card";
import { BarChartCard } from "@/components/charts/bar-chart-card";
import { StackedBarChartCard } from "@/components/charts/stacked-bar-chart-card";
import { AreaChartCard } from "@/components/charts/area-chart-card";
import { PerformanceTable } from "@/components/charts/performance-table";
import { Input } from "@/components/ui/input";
import { DateRangePresets } from "@/components/ui/date-range-presets";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuthStore, type DashboardLayout } from "@/stores/auth-store";
import { updateUserConfigs } from "@/services/users";
import {
  fetchDashboardStats,
  fetchDashboardTicketsQueues,
  fetchDashboardTicketsUsers,
  fetchDashboardTicketsStatus,
  fetchDashboardTicketsChannels,
  fetchDashboardEvolutionByPeriod,
  fetchDashboardPerformance,
  fetchDashboardReasons,
  fetchDashboardReasonsByQueue,
  formatDuration,
  normaliseQtd,
  type DashboardDateRange,
  type RawUserDetail,
  type RawStat,
  type RawStatusStat,
  type RawReasonByQueue,
} from "@/services/dashboard";

// ─── Channel labels mapping (mirrors the legacy front) ─────────────────────────────────────
const CHANNEL_LABELS: Record<string, string> = {
  zapi: "Z-API",
  uazapi: "Uazapi",
  evo: "WhatsApp Evolution",
  meow: "WhatsApp Meow",
  whatsapp: "WhatsApp Web.Js",
  waba: "WhatsApp Official",
  webmail: "Webmail",
  hub_facebook: "Facebook",
  hub_instagram: "Instagram",
  hub_sms: "SMS",
  hub_telegram: "Telegram",
  hub_whatsapp: "WhatsApp Hub",
  hub_whatsapp_business_account: "WhatsApp Hub",
  hub_widget: "Widget",
  hub_webchat: "WebChat",
  hub_email: "Email",
  linkedin: "LinkedIn",
  mercadolivre: "Mercado Livre",
  hub_mercadolivre: "MercadoLivre",
  hub_tiktok: "TikTok",
  hub_linkedin: "LinkedIn",
  hub_olx: "OLX",
  hub_ifood: "iFood",
  hub_twitter: "Twitter",
  hub_youtube: "YouTube",
  telegram: "Telegram",
  instagram: "Instagram",
  baileys: "WhatsApp Baileys",
  zapo: "WhatsApp Zapo",
  webchat: "Webchat",
  messenger: "Messenger",
  olx: "OLX",
  youtube: "YouTube",
  tiktok: "TikTok",
  woocommerce: "WooCommerce",
  nuvemshop: "Nuvemshop",
};

// STATUS_LABELS is now built inside the component with t()
const STATUS_KEYS: Record<string, string> = {
  open: "statusOpen",
  pending: "statusPending",
  closed: "statusClosed",
  schedule: "statusSchedule",
  undefined: "statusUndefined",
};

type FallbackKey = "queue" | "user" | "reason" | "channel" | "period";

/** Garante que o rótulo exibido seja nome (nunca só id numérico). */
function toDisplayName(
  label: string | undefined | null,
  fallbackPrefix: string
): string {
  const s = (label ?? "").trim();
  if (!s) return "–";
  const onlyDigits = /^\d+$/.test(s);
  if (onlyDigits) return `${fallbackPrefix} #${s}`;
  return s;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getDateRange(period: string): DashboardDateRange {
  const now = new Date();
  const today = fmt(now);
  switch (period) {
    case "today": {
      return { startDate: today, endDate: today, isGroup: false };
    }
    case "7d": {
      const s = new Date(now); s.setDate(s.getDate() - 7);
      return { startDate: fmt(s), endDate: today, isGroup: false };
    }
    case "30d": {
      const s = new Date(now); s.setDate(s.getDate() - 30);
      return { startDate: fmt(s), endDate: today, isGroup: false };
    }
    case "90d": {
      const s = new Date(now); s.setDate(s.getDate() - 90);
      return { startDate: fmt(s), endDate: today, isGroup: false };
    }
    default: {
      // Padrão do dashboard = dia corrente (visão operacional do "hoje").
      return { startDate: today, endDate: today, isGroup: false };
    }
  }
}

/** Sparkline decorativa por card (decisão de produto): deriva uma curva
 *  visualmente distinta a partir da série real de evolução do total. */
function varySparkline(
  data: { date: string; value: number }[],
  seed: number
): { date: string; value: number }[] {
  if (!data || data.length < 2) return data;
  const max = Math.max(...data.map((d) => d.value), 1);
  return data.map((d, i) => {
    const sin = Math.sin(seed * 9301 + i * 4967 + seed);
    const cos = Math.cos(seed * 7927 + i * 6271);
    const noise = (sin * cos + 1) / 2;
    const base = d.value / max;
    const varied = base * 0.35 + noise * 0.65;
    return { date: d.date, value: Math.max(0, Math.round(varied * max)) };
  });
}

/** Janela anterior de MESMA duração, imediatamente antes do período atual. */
function getPreviousRange(range: DashboardDateRange): DashboardDateRange {
  const start = new Date(`${range.startDate}T00:00:00`);
  const end = new Date(`${range.endDate}T00:00:00`);
  const durationDays = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - durationDays);
  return { startDate: fmt(prevStart), endDate: fmt(prevEnd), isGroup: range.isGroup };
}

/** Duração {hours,minutes,seconds} da API → minutos crus (null quando ausente). */
function durationToMinutes(d?: { hours?: number; minutes?: number; seconds?: number } | null): number | null {
  if (!d) return null;
  return (d.hours ?? 0) * 60 + (d.minutes ?? 0) + (d.seconds ?? 0) / 60;
}

/**
 * Delta % (atual - anterior)/anterior*100, arredondado a 1 casa.
 * Guards: anterior nulo/0 ou atual nulo → undefined (card não exibe comparativo).
 */
function pctDelta(cur: number | null | undefined, prev: number | null | undefined): number | undefined {
  if (cur == null || prev == null || prev === 0) return undefined;
  if (!Number.isFinite(cur) || !Number.isFinite(prev)) return undefined;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

/** Deltas % vs período anterior por indicador (undefined = sem comparativo). */
interface StatChanges {
  total?: number;
  active?: number;
  receptive?: number;
  newContacts?: number;
  tma?: number;
  tme?: number;
  tpr?: number;
  tte?: number;
}

// ─── Dashboard layout (personalização por usuário) ────────────────────────────
// Blocos (seções) reordenáveis/ocultáveis no nível externo.
const BLOCK_IDS = [
  "aiInsights",
  "stats",
  "pieCharts",
  "evolutionChart",
  "barCharts",
  "reasonsCharts",
  "performanceTable",
] as const;

// Cards de indicadores reordenáveis/ocultáveis dentro do bloco "stats" (granularidade fina).
const STAT_IDS = [
  "statTotal",
  "statActive",
  "statReceptive",
  "statNewContacts",
  "statTma",
  "statTme",
  "statTpr",
  "statTte",
] as const;

const DEFAULT_LAYOUT: DashboardLayout = {
  order: [...BLOCK_IDS],
  statsOrder: [...STAT_IDS],
  hidden: [],
};

const LAYOUT_CACHE_KEY = "dashboardLayout";

// ── Persistência do filtro de período (última escolha, por usuário) ───────────
// Chave: dashboardPeriod:{userId} — valor: {"period":"7d"} (preset) ou
// {"custom":{"start":"YYYY-MM-DD","end":"YYYY-MM-DD"}} (intervalo livre).
const PERIOD_PRESETS = ["today", "7d", "30d", "90d"] as const;
type PersistedPeriod = { period?: string; custom?: { start?: string; end?: string } };
const isYmd = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Reconcilia uma ordem salva com os ids canônicos atuais: mantém a ordem do
 * usuário, descarta ids desconhecidos e acrescenta ids novos no fim. Garante
 * robustez quando widgets são adicionados/removidos em versões futuras.
 */
function reconcileOrder(saved: unknown, canonical: readonly string[]): string[] {
  const valid = new Set<string>(canonical);
  const fromSaved = Array.isArray(saved)
    ? (saved as unknown[]).filter((x): x is string => typeof x === "string" && valid.has(x))
    : [];
  const seen = new Set(fromSaved);
  const merged = [...fromSaved];
  for (const id of canonical) if (!seen.has(id)) merged.push(id);
  return merged;
}

function normalizeLayout(raw: Partial<DashboardLayout> | null | undefined): DashboardLayout {
  const all = new Set<string>([...BLOCK_IDS, ...STAT_IDS]);
  return {
    order: reconcileOrder(raw?.order, BLOCK_IDS),
    statsOrder: reconcileOrder(raw?.statsOrder, STAT_IDS),
    hidden: Array.isArray(raw?.hidden)
      ? (raw!.hidden as unknown[]).filter((x): x is string => typeof x === "string" && all.has(x))
      : [],
  };
}

/**
 * Layout inicial: 1) configs.dashboardLayout (fonte de verdade, cross-device);
 * 2) cache local; 3) migração da chave legada dashboardWidgetOrder; 4) default.
 */
function loadInitialLayout(configLayout?: DashboardLayout): DashboardLayout {
  if (configLayout) return normalizeLayout(configLayout);
  if (typeof window !== "undefined") {
    try {
      const cached = localStorage.getItem(LAYOUT_CACHE_KEY);
      if (cached) return normalizeLayout(JSON.parse(cached));
      const legacy = localStorage.getItem("dashboardWidgetOrder");
      if (legacy) return normalizeLayout({ order: JSON.parse(legacy) });
    } catch { /* ignore */ }
  }
  return DEFAULT_LAYOUT;
}

// ─── Sortable wrappers (alça de arraste + ocultar rápido no modo edição) ──────
function SortableWidget({
  id,
  editing,
  onHide,
  hideLabel,
  children,
}: {
  id: string;
  editing: boolean;
  onHide?: () => void;
  hideLabel?: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      {editing && (
        <div
          {...attributes}
          {...listeners}
          className="absolute -top-2 -left-2 z-10 bg-background border rounded-md p-1 cursor-grab active:cursor-grabbing shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}
      {editing && onHide && (
        <button
          type="button"
          onClick={onHide}
          title={hideLabel}
          className="absolute -top-2 -right-2 z-10 bg-background border rounded-md p-1 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
        >
          <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      )}
      {children}
    </div>
  );
}

// Variante compacta para os cards de indicador dentro do grid interno.
function SortableStatCard({
  id,
  editing,
  onHide,
  hideLabel,
  children,
}: {
  id: string;
  editing: boolean;
  onHide: () => void;
  hideLabel?: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group h-full">
      {editing && (
        <>
          <div
            {...attributes}
            {...listeners}
            className="absolute top-1 left-1 z-10 bg-background/90 border rounded p-0.5 cursor-grab active:cursor-grabbing shadow-sm"
          >
            <GripVertical className="h-3 w-3 text-muted-foreground" />
          </div>
          <button
            type="button"
            onClick={onHide}
            title={hideLabel}
            className="absolute top-1 right-1 z-10 bg-background/90 border rounded p-0.5 shadow-sm hover:text-destructive"
          >
            <EyeOff className="h-3 w-3 text-muted-foreground" />
          </button>
        </>
      )}
      {children}
    </div>
  );
}

// Bloco "stats": grid com DnD próprio (aninhado) para reordenar/ocultar cada card.
function StatsBlock({
  order,
  hidden,
  editing,
  cards,
  hideLabel,
  onReorder,
  onHide,
}: {
  order: string[];
  hidden: string[];
  editing: boolean;
  cards: Record<string, React.ReactNode>;
  hideLabel?: string;
  onReorder: (next: string[]) => void;
  onHide: (id: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor));
  const visible = order.filter((id) => !hidden.includes(id) && cards[id]);

  function handleStatDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = order.indexOf(String(active.id));
      const newIndex = order.indexOf(String(over.id));
      if (oldIndex > -1 && newIndex > -1) onReorder(arrayMove(order, oldIndex, newIndex));
    }
  }

  if (visible.length === 0) return null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleStatDragEnd}>
      <SortableContext items={visible} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-stretch">
          {visible.map((id) => (
            <SortableStatCard key={id} id={id} editing={editing} onHide={() => onHide(id)} hideLabel={hideLabel}>
              {cards[id]}
            </SortableStatCard>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// ─── AI Dashboard Insights History Dialog ────────────────────────────────────
function DashboardInsightsHistoryDialog({
  open,
  onOpenChange,
  onSelect,
  refreshKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (row: DashboardInsightHistoryRow) => void;
  refreshKey: number;
}) {
  const tInsights = useTranslations("dashboardInsights");
  const [rows, setRows] = useState<DashboardInsightHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listDashboardInsights(20, 0);
      setRows(result.rows || []);
    } catch {
      toast.error(tInsights("errorHistory"));
    } finally {
      setLoading(false);
    }
  }, [tInsights]);

  useEffect(() => {
    if (open) load();
  }, [open, refreshKey, load]);

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await deleteDashboardInsight(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch {
      toast.error(tInsights("errorDelete"));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-2xl max-h-[85vh] overflow-x-hidden flex flex-col p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            {tInsights("historyTitle")}
          </DialogTitle>
          <DialogDescription>{tInsights("historyDescription")}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-6 text-center">
              {tInsights("historyEmpty")}
            </p>
          ) : (
            <ul className="space-y-2 py-2">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="rounded-md border p-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-xs font-medium truncate">
                        {new Date(row.createdAt).toLocaleString()}
                      </span>
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                        <Cpu className="h-3 w-3 shrink-0" />
                        {row.model || tInsights("modelUnknown")}
                        {row.provider ? ` · ${row.provider}` : ""}
                        {row.period ? ` · ${row.period}` : ""}
                      </span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          onSelect(row);
                          onOpenChange(false);
                        }}
                      >
                        {tInsights("historyLoad")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                        onClick={() => handleDelete(row.id)}
                        disabled={deletingId === row.id}
                      >
                        {deletingId === row.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <ul className="space-y-1 pl-1">
                    {row.insights.slice(0, 3).map((ins, idx) => (
                      <li key={idx} className="flex gap-2 text-xs text-muted-foreground">
                        <span className="text-violet-600 shrink-0">•</span>
                        <span className="line-clamp-2">{ins}</span>
                      </li>
                    ))}
                    {row.insights.length > 3 && (
                      <li className="text-[11px] text-muted-foreground italic pl-3">
                        {tInsights("historyMore", { count: row.insights.length - 3 })}
                      </li>
                    )}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── AI Dashboard Insights Card ───────────────────────────────────────────────
function DashboardInsightsCard({ stats, period }: { stats: Record<string, unknown>; period?: string }) {
  const tInsights = useTranslations("dashboardInsights");
  const tCopilotPrompts = useTranslations("copilotPrompts");
  const tCopilot = useTranslations("copilot");

  const [insights, setInsights] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [cooldown, setCooldown] = useState(false);
  const [usedModel, setUsedModel] = useState<string | null>(null);
  const [usedProvider, setUsedProvider] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  const handleAnalyze = async () => {
    if (loading || cooldown) return;
    setLoading(true);
    try {
      const systemPrompt = tCopilotPrompts("dashboardInsights");
      const result = await generateDashboardInsights(stats, systemPrompt, period);
      setInsights(result.insights || []);
      setUpdatedAt(result.createdAt ? new Date(result.createdAt) : new Date());
      setUsedModel(result.model || null);
      setUsedProvider(result.provider || null);
      setHistoryRefresh((n) => n + 1);
      setCooldown(true);
      setTimeout(() => setCooldown(false), 30_000);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 422) {
        toast.error(tCopilot("noApiKey"));
      } else {
        toast.error(tInsights("errorInsights"));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFromHistory = (row: DashboardInsightHistoryRow) => {
    setInsights(row.insights || []);
    setUpdatedAt(row.createdAt ? new Date(row.createdAt) : null);
    setUsedModel(row.model || null);
    setUsedProvider(row.provider || null);
  };

  return (
    <div className="rounded-lg border bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:from-violet-950/30 dark:to-fuchsia-950/30 p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles className="h-4 w-4 text-violet-600" />
          <h3 className="text-sm font-semibold">{tInsights("title")}</h3>
          {updatedAt && (
            <span className="text-xs text-muted-foreground">
              · {tInsights("updatedAt")}{" "}
              {updatedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {usedModel && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1 px-1.5 py-0.5 rounded bg-violet-100/60 dark:bg-violet-900/30">
              <Cpu className="h-3 w-3" />
              {usedModel}
              {usedProvider ? ` · ${usedProvider}` : ""}
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => setHistoryOpen(true)}
            title={tInsights("historyTitle")}
          >
            <History className="h-3 w-3" />
            {tInsights("history")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={handleAnalyze}
            disabled={loading || cooldown}
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {loading ? tInsights("analyzing") : tInsights("analyze")}
          </Button>
        </div>
      </div>
      {insights.length > 0 ? (
        <ul className="space-y-1.5">
          {insights.map((insight, idx) => (
            <li key={idx} className="flex gap-2 text-sm">
              <span className="text-violet-600 shrink-0">•</span>
              <span className="text-foreground">{insight}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground italic">{tInsights("empty")}</p>
      )}
      <DashboardInsightsHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onSelect={handleSelectFromHistory}
        refreshKey={historyRefresh}
      />
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const t = useTranslations("dashboardPage");
  const tInsights = useTranslations("dashboardInsights");
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  // Keep-previous-data: skeleton full-page SÓ no primeiro load; refetchs mantêm o
  // conteúdo com overlay sutil. Ref espelha o estado p/ leitura dentro do loadAll
  // (useCallback com deps vazias) sem closure obsoleta.
  const [firstLoadDone, setFirstLoadDone] = useState(false);
  const firstLoadDoneRef = useRef(false);
  // Request-id incremental: só a resposta do request mais recente aplica estado
  // (descarta resposta obsoleta em troca rápida de filtro).
  const loadSeqRef = useRef(0);
  // Padrão: dia corrente. Última escolha do usuário (localStorage) sobrescreve.
  const [period, setPeriod] = useState("today");
  const [isGroup, setIsGroup] = useState(false);

  // date picker (custom)
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  // Gate do 1º fetch: só busca depois de restaurar a última escolha de período
  // do localStorage (evita fetch duplo default→restaurado no mount).
  const [periodReady, setPeriodReady] = useState(false);

  // ── Personalização do dashboard (ordem + ocultar, por usuário) ─────────────
  const setDashboardLayout = useAuthStore((s) => s.setDashboardLayout);
  const userId = user?.userId;
  const isAiAllowed = ["admin", "super"].includes(user?.profile ?? "");

  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_LAYOUT);
  const [editMode, setEditMode] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor));

  useEffect(() => {
    // Aplica o layout salvo quando o usuário (persistido) fica disponível e ao
    // trocar de usuário. NÃO re-dispara no refresh de 30s (userId é estável),
    // então alterações em sessão fluem por persistLayout sem serem sobrescritas.
    setLayout(loadInitialLayout(user?.configs?.dashboardLayout));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.userId]);

  // ── Filtro de período: restaura a última escolha (por usuário) no mount ─────
  // Roda uma única vez assim que o userId está disponível (auth-store persiste e
  // hidrata síncrono; fallback à chave "userId" gravada no login). Valor inválido/
  // corrompido → padrão atual (hoje). Só então o efeito de fetch é liberado.
  useEffect(() => {
    if (periodReady) return;
    const uid = userId ?? (typeof window !== "undefined" ? localStorage.getItem("userId") : null);
    if (uid == null || uid === "") { setPeriodReady(true); return; }
    try {
      const raw = localStorage.getItem(`dashboardPeriod:${uid}`);
      if (raw) {
        const saved = JSON.parse(raw) as PersistedPeriod;
        if (saved?.custom && isYmd(saved.custom.start) && isYmd(saved.custom.end) && saved.custom.start <= saved.custom.end) {
          setCustomStart(saved.custom.start);
          setCustomEnd(saved.custom.end);
          setUseCustom(true);
        } else if ((PERIOD_PRESETS as readonly string[]).includes(saved?.period ?? "")) {
          setPeriod(saved!.period!);
        }
      }
    } catch { /* valor corrompido → mantém padrão */ }
    setPeriodReady(true);
  }, [periodReady, userId]);

  // Persiste a escolha vigente (preset ou intervalo custom) por usuário.
  const persistPeriodChoice = useCallback((choice: PersistedPeriod) => {
    const uid = userId ?? (typeof window !== "undefined" ? localStorage.getItem("userId") : null);
    if (uid == null || uid === "") return;
    try { localStorage.setItem(`dashboardPeriod:${uid}`, JSON.stringify(choice)); } catch { /* ignore */ }
  }, [userId]);

  // Persiste no estado local + cache local + store + backend (configs.dashboardLayout).
  const persistLayout = useCallback((next: DashboardLayout) => {
    setLayout(next);
    if (typeof window !== "undefined") {
      try { localStorage.setItem(LAYOUT_CACHE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    }
    setDashboardLayout(next);
    if (userId) {
      updateUserConfigs(userId, { dashboardLayout: next }).catch(() => { /* persistência silenciosa */ });
    }
  }, [setDashboardLayout, userId]);

  function handleBlockDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = layout.order.indexOf(String(active.id));
      const newIndex = layout.order.indexOf(String(over.id));
      if (oldIndex > -1 && newIndex > -1) {
        persistLayout({ ...layout, order: arrayMove(layout.order, oldIndex, newIndex) });
      }
    }
  }

  const reorderStats = useCallback((nextStats: string[]) => {
    persistLayout({ ...layout, statsOrder: nextStats });
  }, [layout, persistLayout]);

  const hideWidget = useCallback((id: string) => {
    if (layout.hidden.includes(id)) return;
    persistLayout({ ...layout, hidden: [...layout.hidden, id] });
  }, [layout, persistLayout]);

  const toggleWidget = useCallback((id: string, visible: boolean) => {
    const hidden = visible
      ? layout.hidden.filter((h) => h !== id)
      : (layout.hidden.includes(id) ? layout.hidden : [...layout.hidden, id]);
    persistLayout({ ...layout, hidden });
  }, [layout, persistLayout]);

  const resetLayout = useCallback(() => {
    persistLayout(DEFAULT_LAYOUT);
  }, [persistLayout]);

  // stats
  const [totalTickets, setTotalTickets] = useState<number | null>(null);
  const [activeTickets, setActiveTickets] = useState<number | null>(null);
  const [receptiveTickets, setReceptiveTickets] = useState<number | null>(null);
  const [newContacts, setNewContacts] = useState<number | null>(null);
  const [tma, setTma] = useState("–");
  const [tme, setTme] = useState("–");
  const [tpr, setTpr] = useState("–");
  const [tte, setTte] = useState("–");
  // Comparativo vs período anterior (delta % por card; vazio = sem badge).
  const [statChanges, setStatChanges] = useState<StatChanges>({});

  // charts
  const [queues, setQueues] = useState<{ name: string; value: number }[]>([]);
  const [users, setUsers] = useState<{ name: string; value: number }[]>([]);
  const [statuses, setStatuses] = useState<{ name: string; value: number }[]>([]);
  const [channels, setChannels] = useState<{ name: string; value: number }[]>([]);
  const [reasons, setReasons] = useState<{ name: string; value: number }[]>([]);
  const [reasonsByQueue, setReasonsByQueue] = useState<RawReasonByQueue[]>([]);
  const [evolution, setEvolution] = useState<{ date: string; value: number }[]>([]);
  const [performance, setPerformance] = useState<RawUserDetail[]>([]);

  const loadAll = useCallback(async (range: DashboardDateRange) => {
    // Request-id do ciclo: capturado no closure; TODOS os setters abaixo só rodam
    // se este ainda for o request mais recente (guard único pós-await, sem awaits
    // intermediários depois dele).
    const reqId = ++loadSeqRef.current;
    const isRefetch = firstLoadDoneRef.current;
    setLoading(true);
    const safe = <T,>(p: Promise<{ data: T }>) => p.then((r) => r.data).catch(() => null);

    // Comparativo: janela anterior de mesma duração, imediatamente antes da atual.
    const prevRange = getPreviousRange(range);

    const [statsRaw, prevStatsRaw, queuesRaw, usersRaw, statusRaw, channelsRaw, evolutionRaw, perfRaw, reasonsRaw, reasonsByQueueRaw] =
      await Promise.all([
        safe(fetchDashboardStats(range)),
        safe(fetchDashboardStats(prevRange)),
        safe(fetchDashboardTicketsQueues(range)),
        safe(fetchDashboardTicketsUsers(range)),
        safe(fetchDashboardTicketsStatus(range)),
        safe(fetchDashboardTicketsChannels(range)),
        safe(fetchDashboardEvolutionByPeriod(range)),
        safe(fetchDashboardPerformance(range)),
        safe(fetchDashboardReasons(range)),
        safe(fetchDashboardReasonsByQueue(range)),
      ]);

    // Resposta obsoleta (outro filtro foi disparado depois): descarta o ciclo
    // inteiro — nenhum setter abaixo aplica. O ciclo mais novo finaliza o loading.
    if (reqId !== loadSeqRef.current) return;

    // ── Stats card ────────────────────────────────────────────────────────────
    if (Array.isArray(statsRaw) && statsRaw.length > 0) {
      const s = statsRaw[0];
      setTotalTickets(normaliseQtd(s.qtd_total_atendimentos));
      setActiveTickets(normaliseQtd(s.qtd_demanda_ativa));
      setReceptiveTickets(normaliseQtd(s.qtd_demanda_receptiva));
      setNewContacts(normaliseQtd(s.new_contacts));
      setTma(formatDuration(s.tma));
      setTme(formatDuration(s.tme));
      setTpr(formatDuration(s.tpr));
      setTte(formatDuration(s.tte));
      // ── Comparativo vs período anterior ────────────────────────────────────
      // Contadores: delta sobre a quantidade; durações: delta sobre minutos CRUS
      // (nunca sobre o texto formatado). Anterior 0/ausente → sem badge.
      const p = Array.isArray(prevStatsRaw) && prevStatsRaw.length > 0 ? prevStatsRaw[0] : null;
      setStatChanges(p ? {
        total: pctDelta(normaliseQtd(s.qtd_total_atendimentos), normaliseQtd(p.qtd_total_atendimentos)),
        active: pctDelta(normaliseQtd(s.qtd_demanda_ativa), normaliseQtd(p.qtd_demanda_ativa)),
        receptive: pctDelta(normaliseQtd(s.qtd_demanda_receptiva), normaliseQtd(p.qtd_demanda_receptiva)),
        newContacts: pctDelta(normaliseQtd(s.new_contacts), normaliseQtd(p.new_contacts)),
        tma: pctDelta(durationToMinutes(s.tma), durationToMinutes(p.tma)),
        tme: pctDelta(durationToMinutes(s.tme), durationToMinutes(p.tme)),
        tpr: pctDelta(durationToMinutes(s.tpr), durationToMinutes(p.tpr)),
        tte: pctDelta(durationToMinutes(s.tte), durationToMinutes(p.tte)),
      } : {});
    } else if (!isRefetch || Array.isArray(statsRaw)) {
      // Primeiro load ou resposta VÁLIDA vazia: zera. Falha (null) durante um
      // refetch mantém os dados antigos na tela (o toast abaixo avisa).
      setTotalTickets(null); setActiveTickets(null); setReceptiveTickets(null);
      setNewContacts(null); setTma("–"); setTme("–"); setTpr("–"); setTte("–");
      setStatChanges({});
    }

    // ── Queues (label = nome da fila, nunca id) ─────────────────────────────────
    if (Array.isArray(queuesRaw)) {
      setQueues((queuesRaw as RawStat[]).map((e) => ({
        name: toDisplayName(e.label ?? undefined, t("fallbackQueue")),
        value: normaliseQtd(e.qtd),
      })));
    }

    // ── Users (label = nome do usuário, nunca id) ──────────────────────────────
    if (Array.isArray(usersRaw)) {
      setUsers((usersRaw as RawStat[]).map((e) => ({
        name: toDisplayName(e.label ?? undefined, t("fallbackUser")),
        value: normaliseQtd(e.qtd),
      })));
    }

    // ── Status ────────────────────────────────────────────────────────────────
    if (Array.isArray(statusRaw)) {
      setStatuses((statusRaw as RawStatusStat[]).map((e) => ({
        name: (e.status && STATUS_KEYS[e.status] ? t(STATUS_KEYS[e.status]) : null) ?? e.status ?? "–",
        value: normaliseQtd(e.qtd),
      })));
    }

    // ── Channels (sempre nome legível, nunca id) ───────────────────────────────
    if (Array.isArray(channelsRaw)) {
      setChannels((channelsRaw as RawStat[]).map((e) => ({
        name: CHANNEL_LABELS[e.label ?? ""] ?? toDisplayName(e.label ?? undefined, t("fallbackChannel")),
        value: normaliseQtd(e.qtd),
      })));
    }

    // ── Evolution by period ───────────────────────────────────────────────────
    if (Array.isArray(evolutionRaw)) {
      setEvolution((evolutionRaw as RawStat[]).map((e) => ({
        date: e.label ?? "",
        value: normaliseQtd(e.qtd),
      })));
    }

    // ── Reasons (o endpoint devolve `name`, não `label`) ────────────────────────
    if (Array.isArray(reasonsRaw)) {
      setReasons((reasonsRaw as RawStat[]).map((e) => ({
        name: toDisplayName(e.name ?? e.label ?? undefined, t("fallbackReason")),
        value: normaliseQtd(e.qtd),
      })));
    }

    // ── Reasons × Queue (cruzamento para o gráfico empilhado) ───────────────────
    if (Array.isArray(reasonsByQueueRaw)) {
      setReasonsByQueue((reasonsByQueueRaw as RawReasonByQueue[]).map((e) => ({
        queue: toDisplayName(e.queue ?? undefined, t("fallbackQueue")),
        reason: toDisplayName(e.reason ?? undefined, t("fallbackReason")),
        qtd: e.qtd,
      })));
    }

    // ── Performance table ─────────────────────────────────────────────────────
    if (Array.isArray(perfRaw)) {
      setPerformance(perfRaw as RawUserDetail[]);
    }

    // ── Falha parcial em REFETCH: dados antigos permanecem na tela, mas o
    // usuário fica sabendo — UM toast por ciclo (nunca no primeiro load). ──────
    if (isRefetch) {
      const anyFailed = [
        statsRaw, prevStatsRaw, queuesRaw, usersRaw, statusRaw,
        channelsRaw, evolutionRaw, perfRaw, reasonsRaw, reasonsByQueueRaw,
      ].some((r) => r === null);
      if (anyFailed) toast.warning(t("partialRefreshFailed"));
    }

    firstLoadDoneRef.current = true;
    setFirstLoadDone(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!periodReady) return;
    if (useCustom && customStart && customEnd) {
      loadAll({ startDate: customStart, endDate: customEnd, isGroup });
    } else {
      setUseCustom(false);
      loadAll({ ...getDateRange(period), isGroup });
    }
  }, [periodReady, period, isGroup, loadAll]);

  const handleRefresh = () => {
    if (useCustom && customStart && customEnd) {
      loadAll({ startDate: customStart, endDate: customEnd, isGroup });
    } else {
      loadAll({ ...getDateRange(period), isGroup });
    }
  };

  // Preset (Hoje/7/30/90) vindo do DateRangePresets: deriva o id do período pela
  // duração do intervalo gerado ("hoje - N dias" → N), preservando o MESMO fluxo
  // de fetch das antigas Tabs (getDateRange via efeito). Também popula os campos
  // de data como feedback visual — padrão dos relatórios.
  const handlePresetSelect = (start: string, end: string) => {
    const days = Math.round(
      (new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / 86_400_000
    );
    const next = ({ 0: "today", 7: "7d", 30: "30d", 90: "90d" } as Record<number, string>)[days] ?? "today";
    setCustomStart(start);
    setCustomEnd(end);
    setUseCustom(false);
    setPeriod(next);
    persistPeriodChoice({ period: next });
    // Mesmo preset re-clicado (ou custom ativo com period já igual): o efeito não
    // re-dispara (deps inalteradas) → busca manual. O comparativo usa getPreviousRange
    // dentro do loadAll, funcionando igual para qualquer origem do range.
    if (next === period) loadAll({ ...getDateRange(next), isGroup });
  };

  const handleCustomSearch = () => {
    if (!customStart || !customEnd) return;
    if (customStart > customEnd) return;
    setUseCustom(true);
    persistPeriodChoice({ custom: { start: customStart, end: customEnd } });
    loadAll({ startDate: customStart, endDate: customEnd, isGroup });
  };

  // Refetch (troca de filtro/refresh) NÃO destrói a página: mantém o conteúdo
  // com overlay sutil. Skeleton full-page é exclusivo do primeiro load.
  const refreshing = loading && firstLoadDone;

  if (loading && !firstLoadDone) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="space-y-2"><Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-64" /></div>
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[110px]" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[300px]" />)}
        </div>
        <Skeleton className="h-[300px]" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-[300px]" /><Skeleton className="h-[300px]" />
        </div>
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  // Cada card de indicador é um widget atômico (granularidade fina do modo híbrido).
  const vsPrevious = t("vsPreviousPeriod");
  const statCardMap: Record<string, React.ReactNode> = {
    statTotal: <StatCard title={t("totalAttendances")} value={totalTickets ?? "–"} icon={MessageSquare} info={t("totalAttendancesInfo")} delay={0} sparkline={evolution} change={statChanges.total} changeLabel={vsPrevious} />,
    statActive: <StatCard title={t("activeDemand")} value={activeTickets ?? "–"} icon={Phone} info={t("activeDemandInfo")} delay={1} sparkline={varySparkline(evolution, 1)} sparklineColor="hsl(160, 60%, 45%)" change={statChanges.active} changeLabel={vsPrevious} />,
    statReceptive: <StatCard title={t("receptiveDemand")} value={receptiveTickets ?? "–"} icon={UserCheck} info={t("receptiveDemandInfo")} delay={2} sparkline={varySparkline(evolution, 2)} sparklineColor="hsl(270, 55%, 55%)" change={statChanges.receptive} changeLabel={vsPrevious} />,
    statNewContacts: <StatCard title={t("newContacts")} value={newContacts ?? "–"} icon={Users} info={t("newContactsInfo")} delay={3} sparkline={varySparkline(evolution, 3)} sparklineColor="hsl(30, 80%, 55%)" change={statChanges.newContacts} changeLabel={vsPrevious} />,
    statTma: <StatCard title={t("tma")} value={tma} icon={Clock} description={t("tmaDescription")} info={t("tmaInfo")} delay={4} change={statChanges.tma} changeLabel={vsPrevious} invertChange />,
    statTme: <StatCard title={t("tme")} value={tme} icon={Hourglass} description={t("tmeDescription")} info={t("tmeInfo")} delay={5} change={statChanges.tme} changeLabel={vsPrevious} invertChange />,
    statTpr: <StatCard title={t("tpr")} value={tpr} icon={MessageCircleReply} description={t("tprDescription")} info={t("tprInfo")} delay={6} change={statChanges.tpr} changeLabel={vsPrevious} invertChange />,
    statTte: <StatCard title={t("tte")} value={tte} icon={Timer} description={t("tteDescription")} info={t("tteInfo")} delay={7} change={statChanges.tte} changeLabel={vsPrevious} invertChange />,
  };

  // ─── Widget render map ────────────────────────────────────────────────────
  const widgetMap: Record<string, React.ReactNode> = {
    stats: (
      <StatsBlock
        order={layout.statsOrder}
        hidden={layout.hidden}
        editing={editMode}
        cards={statCardMap}
        hideLabel={t("hideWidget")}
        onReorder={reorderStats}
        onHide={hideWidget}
      />
    ),
    aiInsights: ["admin", "super"].includes(user?.profile ?? "") ? (
      <DashboardInsightsCard
        period={period}
        stats={{
          totalTickets,
          activeTickets,
          receptiveTickets,
          newContacts,
          tma,
          tme,
          tpr,
          tte,
          queues: queues.slice(0, 10),
          statuses,
          channels: channels.slice(0, 10),
          users: users.slice(0, 10),
          reasons: reasons.slice(0, 10),
          period,
          isGroup,
        }}
      />
    ) : null,
    pieCharts: (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <PieChartCard title={t("byQueue")} data={queues} donut maxSlices={7} othersLabel={t("others")} />
        <PieChartCard title={t("byStatus")} data={statuses} maxSlices={7} othersLabel={t("others")} />
        <PieChartCard title={t("byChannel")} data={channels} donut maxSlices={7} othersLabel={t("others")} />
      </div>
    ),
    evolutionChart: (
      <AreaChartCard title={t("evolutionByPeriod")} data={evolution} />
    ),
    barCharts: (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BarChartCard title={t("byUser")} data={users} />
        <BarChartCard title={t("byQueue")} data={queues} />
      </div>
    ),
    // Sempre renderiza (como pieCharts/barCharts) — cada card mostra seu próprio
    // estado "Sem dados" quando vazio, em vez de a seção inteira sumir.
    reasonsCharts: (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PieChartCard title={t("byClosingReason")} data={reasons} donut maxSlices={7} othersLabel={t("others")} />
        <StackedBarChartCard title={t("reasonsByQueue")} rows={reasonsByQueue} horizontal />
      </div>
    ),
    performanceTable: (
      <PerformanceTable title={t("performanceByUser")} users={performance} />
    ),
  };

  // Rótulos legíveis para o painel de personalização (reusa chaves existentes onde dá).
  const blockLabels: Record<string, string> = {
    aiInsights: tInsights("title"),
    stats: t("indicatorsLabel"),
    pieCharts: t("distributionLabel"),
    evolutionChart: t("evolutionByPeriod"),
    barCharts: t("comparisonLabel"),
    reasonsCharts: t("byClosingReason"),
    performanceTable: t("performanceByUser"),
  };
  const statLabels: Record<string, string> = {
    statTotal: t("totalAttendances"),
    statActive: t("activeDemand"),
    statReceptive: t("receptiveDemand"),
    statNewContacts: t("newContacts"),
    statTma: t("tma"),
    statTme: t("tme"),
    statTpr: t("tpr"),
    statTte: t("tte"),
  };

  // Blocos visíveis (respeita ocultos + disponibilidade de conteúdo, ex.: IA só admin/super).
  const visibleBlocks = layout.order.filter((id) => !layout.hidden.includes(id) && widgetMap[id]);
  // Blocos elegíveis ao painel (exclui IA quando o perfil não tem acesso).
  const panelBlockIds = layout.order.filter((id) => id !== "aiInsights" || isAiAllowed);

  return (
    <div className="space-y-6 min-w-0">
      {/* Header + controls */}
      <div className="flex items-start justify-between flex-wrap gap-4 min-w-0">
        <PageHeader
          title={t("greeting", { name: user?.username || t("defaultUser") })}
          description={t("controlPanel")}
          help={{
            description: t("helpDesc"),
            sections: [
              { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
              { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
              { title: t("helpAiT"), items: [t("helpAiI0"), t("helpAiI1"), t("helpAiI2")] },
            ],
          }}
        />
        <div className="flex flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto min-w-0">
          {/* Period presets (componente compartilhado c/ relatórios) + customize button */}
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePresets onSelect={handlePresetSelect} />

            <div className="flex items-center gap-1.5 border rounded-md px-2 h-8 min-w-0">
              <Switch
                id="isGroup"
                checked={isGroup}
                onCheckedChange={setIsGroup}
                className="scale-75"
              />
              <Label htmlFor="isGroup" className="text-xs whitespace-nowrap cursor-pointer">
                {isGroup ? t("groups") : t("conversations")}
              </Label>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRefresh} title={t("refresh")}>
              <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </Button>
            {editMode && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => setPanelOpen(true)}
                title={t("widgets")}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("widgets")}</span>
              </Button>
            )}
            <Button
              variant={editMode ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => setEditMode(!editMode)}
              title={editMode ? t("done") : t("customize")}
            >
              {editMode ? <Check className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{editMode ? t("done") : t("customize")}</span>
            </Button>
          </div>
          {/* Custom date range */}
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex items-center gap-1 w-full sm:w-auto sm:flex-none min-w-0">
              <Label className="text-xs whitespace-nowrap">{t("from")}</Label>
              <Input type="date" className="h-7 text-xs flex-1 sm:w-36" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            </div>
            <div className="flex items-center gap-1 w-full sm:w-auto sm:flex-none min-w-0">
              <Label className="text-xs whitespace-nowrap">{t("to")}</Label>
              <Input type="date" className="h-7 text-xs flex-1 sm:w-36" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
            </div>
            <Button size="sm" className="h-7 text-xs px-3 w-full sm:w-auto" onClick={handleCustomSearch} disabled={!customStart || !customEnd || customStart > customEnd}>
              <Calendar className="h-3 w-3 mr-1" /> {t("generate")}
            </Button>
          </div>
        </div>
      </div>

      {/* Blocos reordenáveis / ocultáveis. Em refetch, mantém o conteúdo com
          overlay sutil (keep-previous-data) em vez de destruir a página. */}
      <div className={refreshing ? "opacity-60 pointer-events-none transition-opacity duration-200" : "transition-opacity duration-200"}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleBlockDragEnd}>
          <SortableContext items={visibleBlocks} strategy={rectSortingStrategy}>
            <div className="space-y-6">
              {visibleBlocks.map((id) => (
                <SortableWidget
                  key={id}
                  id={id}
                  editing={editMode}
                  onHide={() => hideWidget(id)}
                  hideLabel={t("hideWidget")}
                >
                  {widgetMap[id]}
                </SortableWidget>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {/* Painel de personalização: mostrar/ocultar tudo + restaurar padrão */}
      <Dialog open={panelOpen} onOpenChange={setPanelOpen}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" /> {t("widgetsTitle")}
            </DialogTitle>
            <DialogDescription>{t("widgetsDesc")}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
            <div className="space-y-4 py-1">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">{t("sectionsLabel")}</p>
                <div className="space-y-1">
                  {panelBlockIds.map((id) => {
                    const visible = !layout.hidden.includes(id);
                    return (
                      <div key={id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                        <span className="text-sm flex items-center gap-2 min-w-0">
                          {visible ? <Eye className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                          <span className="truncate">{blockLabels[id] ?? id}</span>
                        </span>
                        <Switch checked={visible} onCheckedChange={(v) => toggleWidget(id, v)} className="scale-90 shrink-0" />
                      </div>
                    );
                  })}
                </div>
              </div>
              {!layout.hidden.includes("stats") && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">{t("indicatorsLabel")}</p>
                  <div className="space-y-1">
                    {layout.statsOrder.map((id) => {
                      const visible = !layout.hidden.includes(id);
                      return (
                        <div key={id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                          <span className="text-sm flex items-center gap-2 min-w-0">
                            {visible ? <Eye className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                            <span className="truncate">{statLabels[id] ?? id}</span>
                          </span>
                          <Switch checked={visible} onCheckedChange={(v) => toggleWidget(id, v)} className="scale-90 shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end pt-2 border-t">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={resetLayout}>
              <RotateCcw className="h-3.5 w-3.5" /> {t("restoreDefault")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
