"use client";

import { formatCurrencyBRL } from "@/lib/format";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { TrendingUp, Users, Target, DollarSign, RefreshCw, XCircle, Percent, Tag as TagIcon, Wallet as WalletIcon, Layout as KanbanIcon } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { fetchOpportunities, fetchStages, fetchPipelines } from "@/services/funnel";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { FunnelDashboardCharts } from "@/components/funil/funnel-dashboard-charts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stage { id: number; name: string; pipelineId: number; }
interface Pipeline { id: number; name: string; }
interface ContactTag { id: number; tag?: string; name?: string; color?: string }
interface ContactWallet { id: number; name: string }
interface KanbanInfo { id: number; name: string; color?: string }
interface OpportunityContact {
  id: number;
  name?: string;
  tags?: ContactTag[];
  wallets?: ContactWallet[];
  kanban?: number | null;
  kanbanInfo?: KanbanInfo | null;
}
interface Opportunity {
  id: number;
  status: string;
  value?: number;
  stageId: number;
  pipelineId: number;
  contact?: OpportunityContact;
}

interface AggregateRow { id: number | string; label: string; color?: string; count: number; value: number; percent: number; }

interface EtapaInfo { id: number; name: string; value: number; percent: number; }

interface DashboardState {
  total: number;
  open: number;
  won: number;
  lost: number;
  avgTicket: number;
  winRate: number;
  totalValue: number;
  wonValue: number;
  etapas: EtapaInfo[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDashboard(opps: Opportunity[], stages: Stage[]): DashboardState {
  const total = opps.length;
  const won = opps.filter(o => o.status === "win").length;
  const lost = opps.filter(o => o.status === "lose").length;
  const open = opps.filter(o => o.status === "open").length;
  const totalValue = opps.reduce((acc, o) => acc + (Number(o.value) || 0), 0);
  const wonValue = opps.filter(o => o.status === "win").reduce((acc, o) => acc + (Number(o.value) || 0), 0);
  const avgTicket = total > 0 ? totalValue / total : 0;
  const winRate = total > 0 ? (won / total) * 100 : 0;

  // Per-stage values (matching Vue montarEtapas)
  const valByStage: Record<number, number> = {};
  stages.forEach(s => { valByStage[s.id] = 0; });
  opps.forEach(o => {
    if (valByStage[o.stageId] !== undefined) valByStage[o.stageId] += Number(o.value) || 0;
  });
  const maxVal = Math.max(...Object.values(valByStage), 1);
  const etapas: EtapaInfo[] = stages.map(s => ({
    id: s.id,
    name: s.name,
    value: valByStage[s.id] ?? 0,
    percent: ((valByStage[s.id] ?? 0) / maxVal) * 100,
  }));

  return { total, open, won, lost, avgTicket, winRate, totalValue, wonValue, etapas };
}

// Agrega oportunidades por tags do contato (M2M — uma opp pode aparecer em varias tags)
function buildTagAggregate(opps: Opportunity[]): AggregateRow[] {
  const map = new Map<number, { label: string; color?: string; count: number; value: number }>();
  for (const o of opps) {
    const tags = o.contact?.tags ?? [];
    for (const t of tags) {
      const key = Number(t.id);
      const label = t.name ?? t.tag ?? "—";
      const cur = map.get(key) ?? { label, color: t.color, count: 0, value: 0 };
      cur.count += 1;
      cur.value += Number(o.value) || 0;
      map.set(key, cur);
    }
  }
  const rows = Array.from(map.entries()).map(([id, r]) => ({ id, ...r, percent: 0 }));
  rows.sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...rows.map(r => r.count));
  return rows.map(r => ({ ...r, percent: (r.count / max) * 100 }));
}

// Agrega por carteira (M2M — uma opp pode aparecer em varias carteiras)
function buildWalletAggregate(opps: Opportunity[]): AggregateRow[] {
  const map = new Map<number, { label: string; count: number; value: number }>();
  for (const o of opps) {
    const wallets = o.contact?.wallets ?? [];
    for (const w of wallets) {
      const key = Number(w.id);
      const cur = map.get(key) ?? { label: w.name ?? "—", count: 0, value: 0 };
      cur.count += 1;
      cur.value += Number(o.value) || 0;
      map.set(key, cur);
    }
  }
  const rows = Array.from(map.entries()).map(([id, r]) => ({ id, ...r, percent: 0 }));
  rows.sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...rows.map(r => r.count));
  return rows.map(r => ({ ...r, percent: (r.count / max) * 100 }));
}

// Agrega por kanban do contato (1-1 — opp em um unico kanban ou sem kanban)
function buildKanbanAggregate(opps: Opportunity[], noneLabel: string): AggregateRow[] {
  const map = new Map<string, { label: string; color?: string; count: number; value: number }>();
  for (const o of opps) {
    const k = o.contact?.kanbanInfo;
    const key = k ? String(k.id) : "_none";
    const label = k ? k.name : noneLabel;
    const cur = map.get(key) ?? { label, color: k?.color, count: 0, value: 0 };
    cur.count += 1;
    cur.value += Number(o.value) || 0;
    map.set(key, cur);
  }
  const rows = Array.from(map.entries()).map(([id, r]) => ({ id, ...r, percent: 0 }));
  rows.sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...rows.map(r => r.count));
  return rows.map(r => ({ ...r, percent: (r.count / max) * 100 }));
}

// ─── Component ────────────────────────────────────────────────────────────────

const LIMIT_VALUES = [100, 500, 1000, 0];

export default function FunilDashboardPage() {
  const t = useTranslations("funilDashboardPage");
  const allowed = usePageAccess("funil", { alsoAccept: ["kanban"] });
  const [loading, setLoading] = useState(true);
  const [limite, setLimite] = useState(100);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [stats, setStats] = useState<DashboardState>({
    total: 0, open: 0, won: 0, lost: 0, avgTicket: 0, winRate: 0, totalValue: 0, wonValue: 0, etapas: [],
  });

  async function loadData(limit: number = limite) {
    setLoading(true);
    try {
      const [oppRes, stagesRes, pipesRes] = await Promise.all([
        fetchOpportunities({
          page: 1,
          limit: limit === 0 ? 10000 : limit,
          ordenacao: "data_desc",
          include: "tags,wallets,kanban",
        }),
        fetchStages({ page: 1, limit: 100 }),
        fetchPipelines({ page: 1, limit: 100 }),
      ]);

      const opps: Opportunity[] = (oppRes.data?.data ?? (Array.isArray(oppRes.data) ? oppRes.data : [])).map(
        (o: Opportunity) => ({ ...o, status: (o.status ?? "").toLowerCase() })
      );
      const stagesData: Stage[] = stagesRes.data?.data ?? (Array.isArray(stagesRes.data) ? stagesRes.data : []);
      const pipesData: Pipeline[] = pipesRes.data?.data ?? (Array.isArray(pipesRes.data) ? pipesRes.data : []);

      setStages(stagesData);
      setPipelines(pipesData);
      setOpportunities(opps);
      setStats(buildDashboard(opps, stagesData));
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData(100); }, []);

  if (!allowed) return <AccessDenied />;

  function handleLimiteChange(val: string) {
    const n = Number(val);
    setLimite(n);
    loadData(n);
  }

  // KPI cards — matching Vue montarIndicadores order
  const cards = [
    {
      label: t("created"),
      value: String(stats.total),
      icon: Users,
      color: "text-blue-500",
    },
    {
      label: t("open"),
      value: String(stats.open),
      icon: Target,
      color: "text-amber-500",
    },
    {
      label: t("wonDeals"),
      value: String(stats.won),
      icon: TrendingUp,
      color: "text-green-500",
    },
    {
      label: t("lostDeals"),
      value: String(stats.lost),
      icon: XCircle,
      color: "text-red-500",
    },
    {
      label: t("avgTicket"),
      value: `R$ ${stats.avgTicket.toFixed(2)}`,
      icon: DollarSign,
      color: "text-emerald-500",
    },
    {
      label: t("conversionRate"),
      value: `${stats.winRate.toFixed(2)}%`,
      icon: Percent,
      color: "text-indigo-500",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pageTitle")}
        description={t("pageDescription")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
          ],
        }}
      />
      {/* Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Label className="text-sm shrink-0">{t("show")}:</Label>
          <Select value={String(limite)} onValueChange={handleLimiteChange}>
            <SelectTrigger className="w-40 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIMIT_VALUES.map(v => (
                <SelectItem key={v} value={String(v)}>{v === 0 ? t("limitAll") : t("limitLast", { count: v })}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadData(limite)} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {t("refresh")}
        </Button>
      </div>

      {/* KPI Cards */}
      {loading ? (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {cards.map(card => {
            const Icon = card.icon;
            return (
              <Card key={card.label} className="bg-primary text-primary-foreground border-0 shadow">
                <CardHeader className="flex flex-row items-center justify-between pb-1 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-primary-foreground/80">{card.label}</CardTitle>
                  <Icon className="h-5 w-5 text-primary-foreground/80" />
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="text-2xl font-bold text-primary-foreground">{card.value}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Financial totals — total oportunidades R$ and total ganhos R$ */}
      {!loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="border-2 border-amber-200 dark:border-amber-800">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-amber-500" />
                {t("totalValue")}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <div className="text-2xl font-bold text-amber-600">
                {formatCurrencyBRL(stats.totalValue)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{t("totalValueDesc", { count: stats.total })}</p>
            </CardContent>
          </Card>
          <Card className="border-2 border-green-200 dark:border-green-800">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                {t("wonValue")}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <div className="text-2xl font-bold text-green-600">
                {formatCurrencyBRL(stats.wonValue)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{t("wonValueDesc", { count: stats.won })}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts */}
      {!loading && opportunities.length > 0 && (
        <FunnelDashboardCharts opportunities={opportunities} stages={stages} />
      )}

      {/* Per-stage value breakdown */}
      {!loading && stats.etapas.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {t("valueByStage")}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stats.etapas.map(etapa => (
              <div key={etapa.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium truncate">{etapa.name}</span>
                  <span className="text-sm font-bold text-green-600 ml-2 shrink-0">
                    R$ {etapa.value.toFixed(2)}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${etapa.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contact aggregates — tags / carteiras / kanbans */}
      {!loading && opportunities.length > 0 && (
        <ContactAggregateBlocks opportunities={opportunities} t={t} />
      )}

      {/* Active pipelines summary */}
      {!loading && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("activePipelines")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{pipelines.length}</div>
            <p className="text-xs text-muted-foreground mt-1">{t("totalStages", { count: stages.length })}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Contact aggregates block ─────────────────────────────────────────────────

interface AggregateBlocksProps {
  opportunities: Opportunity[];
  t: ReturnType<typeof useTranslations>;
}

function ContactAggregateBlocks({ opportunities, t }: AggregateBlocksProps) {
  const tagRows = buildTagAggregate(opportunities).slice(0, 10);
  const walletRows = buildWalletAggregate(opportunities).slice(0, 10);
  const kanbanRows = buildKanbanAggregate(opportunities, t("kanbanNone")).slice(0, 10);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <AggregateCard
        title={t("byTags")}
        empty={t("noTags")}
        icon={<TagIcon className="h-4 w-4 text-blue-500" />}
        rows={tagRows}
      />
      <AggregateCard
        title={t("byWallets")}
        empty={t("noWallets")}
        icon={<WalletIcon className="h-4 w-4 text-purple-500" />}
        rows={walletRows}
      />
      <AggregateCard
        title={t("byKanbans")}
        empty={t("noKanbans")}
        icon={<KanbanIcon className="h-4 w-4 text-emerald-500" />}
        rows={kanbanRows}
      />
    </div>
  );
}

interface AggregateCardProps {
  title: string;
  empty: string;
  icon: React.ReactNode;
  rows: AggregateRow[];
}

function AggregateCard({ title, empty, icon, rows }: AggregateCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          {icon}{title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-4 space-y-2">
        {rows.length === 0 && <p className="text-xs text-muted-foreground">{empty}</p>}
        {rows.map(row => (
          <div key={row.id} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-2 truncate">
                {row.color && <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: row.color }} />}
                <span className="truncate">{row.label}</span>
              </span>
              <span className="ml-2 shrink-0 tabular-nums text-muted-foreground">
                {row.count} · {formatCurrencyBRL(row.value)}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5">
              <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${row.percent}%` }} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
