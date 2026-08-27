"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  AlertCircle,
  BarChart3,
  Building2,
  ChevronDown,
  Coins,
  FileBarChart,
  Gauge,
  Info,
  MessagesSquare,
  RefreshCw,
} from "lucide-react";

import { AreaChartCard } from "@/components/charts/area-chart-card";
import { BarChartCard } from "@/components/charts/bar-chart-card";
import { StackedBarChartCard } from "@/components/charts/stacked-bar-chart-card";
import { StatCard } from "@/components/charts/stat-card";

import * as gupshupApi from "@/services/gupshup";
import * as dialog360Api from "@/services/dialog360";
import * as wabaMetaApi from "@/services/waba-meta";

type Channel = "waba" | "gupshup" | "dialog360";

function pickApi(channel: Channel) {
  if (channel === "gupshup") return gupshupApi;
  if (channel === "dialog360") return dialog360Api;
  return wabaMetaApi;
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function ymdMinusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function unixSecondsFromYmd(ymd: string): number {
  return Math.floor(new Date(ymd + "T00:00:00Z").getTime() / 1000);
}

// ─── Helpers de parse defensivo (shapes variam por BSP) ───────────────────────

type AnyRec = Record<string, any>;

function toNum(v: any): number {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
}

/** Converte start/end (unix s, unix ms ou "YYYY-MM-DD") para segundos unix. */
function toEpochSeconds(v: any): number | null {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : Math.floor(t / 1000);
  }
  const n = typeof v === "string" ? parseInt(v, 10) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 1e12 ? Math.floor(n / 1000) : n;
}

/** Coleta todos os data_points, aceitando { data: [{ data_points }] }, { data_points } ou arrays. */
function collectDataPoints(node: any): AnyRec[] {
  try {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap((n) => collectDataPoints(n));
    if (Array.isArray(node.data_points)) {
      return node.data_points.filter((p: any) => p && typeof p === "object");
    }
    if (Array.isArray(node.data)) return node.data.flatMap((n: any) => collectDataPoints(n));
    return [];
  } catch {
    return [];
  }
}

/** True se a estrutura tem AO MENOS um array data_points (mesmo vazio) — distingue "vazio" de "shape inesperado". */
function hasDataPointsArray(node: any): boolean {
  if (!node || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some(hasDataPointsArray);
  if (Array.isArray((node as AnyRec).data_points)) return true;
  if (Array.isArray((node as AnyRec).data)) return (node as AnyRec).data.some(hasDataPointsArray);
  return false;
}

/** "FREE_TIER" → "Free Tier" */
function humanizeEnum(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  if (!s) return "";
  return s
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function safeStringify(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2) ?? String(data);
  } catch {
    return String(data);
  }
}

function formatPeriodLabel(startSec: number, granularity: string, locale: string): string {
  const d = new Date(startSec * 1000);
  if (Number.isNaN(d.getTime())) return String(startSec);
  try {
    if (granularity === "HALF_HOUR") {
      return d.toLocaleString(locale, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    }
    if (granularity === "MONTHLY") {
      return d.toLocaleDateString(locale, { month: "short", year: "numeric" });
    }
    return d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** Formata custo na moeda da conta quando conhecida; senão cru com 4 casas. */
function formatCost(value: number, locale: string, currency?: string): string {
  if (currency && /^[A-Za-z]{3}$/.test(currency)) {
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase() }).format(value);
    } catch {
      // moeda inválida → cai no formato cru
    }
  }
  return value.toLocaleString(locale, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

/** Accordion "Dados brutos" (JSON cru preservado no rodapé de cada aba). */
function RawDataDetails({ data, label }: { data: unknown; label: string }) {
  return (
    <details className="group rounded-md border border-border">
      <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground">
        <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180" />
        <span>{label}</span>
      </summary>
      <pre className="text-xs overflow-auto max-h-96 bg-muted p-3 rounded-b-md border-t border-border">{safeStringify(data)}</pre>
    </details>
  );
}

// ─── View models ──────────────────────────────────────────────────────────────

interface AccountField {
  key: string;
  label: string;
  value: string;
}

type AccountView = { known: AccountField[]; other: { key: string; value: string }[] } | "fallback" | null;

type ConversationView =
  | {
      kind: "parsed";
      series: { date: string; value: number }[];
      total: number;
      hasCost: boolean;
      totalCost: number;
      categories: { name: string; conversations: number; cost: number }[];
      isEmpty: boolean;
    }
  | { kind: "missing" }
  | { kind: "fallback" }
  | null;

type PricingView =
  | {
      kind: "parsed";
      totalVolume: number;
      hasCost: boolean;
      totalCost: number;
      stackedRows: { queue: string; reason: string; qtd: number }[];
      barData: { name: string; value: number }[];
      series: { date: string; value: number }[];
      multiCountry: boolean;
      hasNamedCategory: boolean;
      isEmpty: boolean;
    }
  | { kind: "missing" }
  | { kind: "fallback" }
  | null;

type TemplatesView =
  | {
      kind: "parsed";
      rows: { id: string; name: string; sent: number; delivered: number; read: number; clicked: number }[];
      totals: { sent: number; delivered: number; read: number; clicked: number };
      hasClicks: boolean;
    }
  | { kind: "fallback" }
  | null;

/** Valor de campo da conta como texto legível (objetos {name,id} viram "name (id)"). */
function accountDisplayValue(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return /^[A-Z0-9_]+$/.test(v) && v.length > 3 ? humanizeEnum(v) : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object" && !Array.isArray(v) && (v.name || v.id)) {
    const nm = v.name ? String(v.name) : "";
    const idp = v.id ? String(v.id) : "";
    return nm && idp ? `${nm} (${idp})` : nm || idp;
  }
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export default function AnalyticsPage() {
  const t = useTranslations("Analytics");
  const locale = useLocale();
  const router = useRouter();
  const search = useSearchParams();
  const queryChannel = (search.get("channel") as Channel) || "waba";
  const [channel, setChannel] = useState<Channel>(["waba", "gupshup", "dialog360"].includes(queryChannel) ? queryChannel : "waba");

  const [wabaId, setWabaId] = useState("");
  const [businessToken, setBusinessToken] = useState("");
  const [start, setStart] = useState(ymdMinusDays(7));
  const [end, setEnd] = useState(todayYmd());
  const [granularity, setGranularity] = useState<"HALF_HOUR" | "DAILY" | "MONTHLY">("DAILY");

  const [wabaData, setWabaData] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [tplAnalytics, setTplAnalytics] = useState<any>(null);
  const [limits, setLimits] = useState<any>(null);

  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"data" | "analytics" | "templates" | "limits">("data");

  const api = useMemo(() => pickApi(channel), [channel]);

  // Moeda da conta (disponível após carregar a aba "Dados WABA"); usada p/ formatar custos.
  const accountCurrency = typeof wabaData?.currency === "string" ? wabaData.currency : undefined;

  // Sync URL channel param
  useEffect(() => {
    const params = new URLSearchParams(Array.from(search.entries()));
    if (params.get("channel") !== channel) {
      params.set("channel", channel);
      router.replace(`/analytics?${params.toString()}`);
    }
  }, [channel]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLoadData() {
    if (!wabaId || !businessToken) {
      toast.error(t("missingCredentials") || "Informe wabaId e businessToken");
      return;
    }
    setLoading(true);
    try {
      const r = await api.getWABAData({ wabaId, businessToken });
      setWabaData(r.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadAnalytics() {
    if (!wabaId || !businessToken) {
      toast.error(t("missingCredentials") || "Informe wabaId e businessToken");
      return;
    }
    setLoading(true);
    try {
      const r = await api.getWABAAnalytics({
        wabaId,
        businessToken,
        start: unixSecondsFromYmd(start),
        end: unixSecondsFromYmd(end) + 86399,
        granularity,
        conversationAnalytics: true,
        pricingAnalytics: true,
      });
      setAnalytics(r.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadTemplates() {
    if (!wabaId || !businessToken) {
      toast.error(t("missingCredentials") || "Informe wabaId e businessToken");
      return;
    }
    setLoading(true);
    try {
      const r = await api.getWABATemplateAnalytics({ wabaId, businessToken, start, end });
      setTplAnalytics(r.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadLimits() {
    setLoading(true);
    try {
      const r = await api.getWABALimitsInfo();
      setLimits(r.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  }

  // ─── Aba Dados WABA: metadata da conta → lista chave-valor legível ──────────
  const accountView: AccountView = useMemo(() => {
    if (wabaData === null || wabaData === undefined) return null;
    try {
      if (typeof wabaData !== "object" || Array.isArray(wabaData)) return "fallback";
      const labelFor: Record<string, string> = {
        name: t("accountFieldName") || "Nome",
        id: t("accountFieldId") || "ID da conta (WABA)",
        currency: t("accountFieldCurrency") || "Moeda",
        country: t("accountFieldCountry") || "País",
        timezone_id: t("accountFieldTimezone") || "Fuso horário",
        business_verification_status: t("accountFieldVerification") || "Verificação do negócio",
        account_review_status: t("accountFieldAccountReview") || "Análise da conta",
        status: t("accountFieldStatus") || "Status",
        message_template_namespace: t("accountFieldTemplateNamespace") || "Namespace de templates",
        owner_business_info: t("accountFieldOwnerBusiness") || "Empresa proprietária",
        on_behalf_of_business_info: t("accountFieldOnBehalf") || "Em nome de",
      };
      const knownOrder = Object.keys(labelFor);
      const known: AccountField[] = [];
      for (const key of knownOrder) {
        if ((wabaData as AnyRec)[key] !== undefined) {
          known.push({ key, label: labelFor[key], value: accountDisplayValue((wabaData as AnyRec)[key]) });
        }
      }
      const other: { key: string; value: string }[] = [];
      for (const [key, value] of Object.entries(wabaData as AnyRec)) {
        if (knownOrder.includes(key) || key === "paging") continue;
        other.push({ key, value: accountDisplayValue(value) });
      }
      return { known, other };
    } catch {
      return "fallback";
    }
  }, [wabaData, t]);

  // ─── Conversation analytics: data_points → série temporal + KPIs ────────────
  const conversationView: ConversationView = useMemo(() => {
    if (analytics === null || analytics === undefined) return null;
    const raw = analytics?.conversation_analytics;
    if (raw === null || raw === undefined) return { kind: "missing" };
    try {
      if (!hasDataPointsArray(raw)) return { kind: "fallback" };
      const points = collectDataPoints(raw);
      const byStart = new Map<number, number>();
      const byCat = new Map<string, { conversations: number; cost: number }>();
      let total = 0;
      let totalCost = 0;
      let hasCost = false;
      for (const p of points) {
        const conv = toNum(p.conversation ?? p.conversations ?? p.count);
        total += conv;
        if (p.cost !== undefined && p.cost !== null) {
          hasCost = true;
          totalCost += toNum(p.cost);
        }
        const sec = toEpochSeconds(p.start ?? p.end);
        if (sec !== null) byStart.set(sec, (byStart.get(sec) ?? 0) + conv);
        const cat = p.conversation_category ?? p.conversation_type;
        if (cat) {
          const key = String(cat);
          const bucket = byCat.get(key) ?? { conversations: 0, cost: 0 };
          bucket.conversations += conv;
          bucket.cost += toNum(p.cost);
          byCat.set(key, bucket);
        }
      }
      const series = [...byStart.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([sec, value]) => ({ date: formatPeriodLabel(sec, granularity, locale), value }));
      const categories = [...byCat.entries()]
        .sort((a, b) => b[1].conversations - a[1].conversations)
        .map(([name, v]) => ({ name, conversations: v.conversations, cost: v.cost }));
      return { kind: "parsed", series, total, hasCost, totalCost, categories, isEmpty: points.length === 0 };
    } catch {
      return { kind: "fallback" };
    }
  }, [analytics, granularity, locale]);

  // ─── Pricing analytics: data_points → barras por categoria + KPIs ───────────
  const pricingView: PricingView = useMemo(() => {
    if (analytics === null || analytics === undefined) return null;
    const raw = analytics?.pricing_analytics;
    if (raw === null || raw === undefined) return { kind: "missing" };
    try {
      if (!hasDataPointsArray(raw)) return { kind: "fallback" };
      const points = collectDataPoints(raw);
      let totalVolume = 0;
      let totalCost = 0;
      let hasCost = false;
      let hasNamedCategory = false;
      const catCountry = new Map<string, Map<string, number>>();
      const countryTotals = new Map<string, number>();
      const byStart = new Map<number, number>();
      for (const p of points) {
        const vol = toNum(p.volume ?? p.conversation ?? p.count);
        totalVolume += vol;
        if (p.cost !== undefined && p.cost !== null) {
          hasCost = true;
          totalCost += toNum(p.cost);
        }
        const catRaw = p.pricing_category ?? p.pricing_type ?? p.category;
        const cat = catRaw ? humanizeEnum(catRaw) : "";
        if (cat) hasNamedCategory = true;
        const catKey = cat || "—";
        const countryKey = p.country ? String(p.country) : "—";
        countryTotals.set(countryKey, (countryTotals.get(countryKey) ?? 0) + vol);
        const m = catCountry.get(catKey) ?? new Map<string, number>();
        m.set(countryKey, (m.get(countryKey) ?? 0) + vol);
        catCountry.set(catKey, m);
        const sec = toEpochSeconds(p.start ?? p.end);
        if (sec !== null) byStart.set(sec, (byStart.get(sec) ?? 0) + vol);
      }
      // Top 7 países + "Outros" (evita legenda gigante no empilhado)
      const topCountries = new Set(
        [...countryTotals.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 7)
          .map(([c]) => c)
      );
      const othersLabel = t("othersLabel") || "Outros";
      const stackedRows: { queue: string; reason: string; qtd: number }[] = [];
      catCountry.forEach((m, cat) => {
        const merged = new Map<string, number>();
        m.forEach((v, country) => {
          const key = topCountries.has(country) ? country : othersLabel;
          merged.set(key, (merged.get(key) ?? 0) + v);
        });
        merged.forEach((v, country) => stackedRows.push({ queue: cat, reason: country, qtd: v }));
      });
      const barData = [...catCountry.entries()]
        .map(([name, m]) => ({ name, value: [...m.values()].reduce((s, v) => s + v, 0) }))
        .sort((a, b) => b.value - a.value);
      const series = [...byStart.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([sec, value]) => ({ date: formatPeriodLabel(sec, granularity, locale), value }));
      const realCountries = [...countryTotals.keys()].filter((c) => c !== "—");
      return {
        kind: "parsed",
        totalVolume,
        hasCost,
        totalCost,
        stackedRows,
        barData,
        series,
        multiCountry: realCountries.length > 1,
        hasNamedCategory,
        isEmpty: points.length === 0,
      };
    } catch {
      return { kind: "fallback" };
    }
  }, [analytics, granularity, locale, t]);

  // ─── Template analytics: data_points → tabela agregada por template ─────────
  const templatesView: TemplatesView = useMemo(() => {
    if (tplAnalytics === null || tplAnalytics === undefined) return null;
    try {
      if (!hasDataPointsArray(tplAnalytics)) return { kind: "fallback" };
      const points = collectDataPoints(tplAnalytics);
      const byTpl = new Map<string, { name: string; sent: number; delivered: number; read: number; clicked: number }>();
      for (const p of points) {
        const id = String(p.template_id ?? p.template_name ?? p.name ?? "—");
        const name = String(p.template_name ?? p.name ?? p.template_id ?? "—");
        const row = byTpl.get(id) ?? { name, sent: 0, delivered: 0, read: 0, clicked: 0 };
        row.sent += toNum(p.sent);
        row.delivered += toNum(p.delivered);
        row.read += toNum(p.read);
        row.clicked += Array.isArray(p.clicked)
          ? p.clicked.reduce((s: number, c: any) => s + toNum(c?.count), 0)
          : toNum(p.clicked);
        byTpl.set(id, row);
      }
      const rows = [...byTpl.entries()].map(([id, r]) => ({ id, ...r })).sort((a, b) => b.sent - a.sent);
      const totals = rows.reduce(
        (acc, r) => ({
          sent: acc.sent + r.sent,
          delivered: acc.delivered + r.delivered,
          read: acc.read + r.read,
          clicked: acc.clicked + r.clicked,
        }),
        { sent: 0, delivered: 0, read: 0, clicked: 0 }
      );
      return { kind: "parsed", rows, totals, hasClicks: totals.clicked > 0 };
    } catch {
      return { kind: "fallback" };
    }
  }, [tplAnalytics]);

  const readRate = (read: number, delivered: number): string =>
    delivered > 0 ? `${((read / delivered) * 100).toLocaleString(locale, { maximumFractionDigits: 1 })}%` : "—";

  const rawDataLabel = t("rawData") || "Dados brutos";
  const costInfo = !accountCurrency
    ? t("costUnknownCurrencyHint") ||
      "Moeda da conta não detectada; carregue a aba Dados WABA para formatar o custo na moeda correta. Valor exibido com 4 casas decimais."
    : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title") || "Analytics WABA"}
        description={t("description") || "Métricas de conversação, preços e templates por canal"}
      />

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label>{t("channel") || "Canal"}</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="waba">WABA Meta</SelectItem>
                  <SelectItem value="gupshup">Gupshup (BSP)</SelectItem>
                  <SelectItem value="dialog360">Dialog360 (BSP)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>WABA ID</Label>
              <Input value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="123456789..." />
            </div>
            <div className="md:col-span-2">
              <Label>{t("businessToken") || "Business Token (BM)"}</Label>
              <Input value={businessToken} onChange={(e) => setBusinessToken(e.target.value)} placeholder="EAA..." type="password" />
            </div>
          </div>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>{t("authNote") || "Como obter credenciais"}</AlertTitle>
            <AlertDescription className="text-sm">
              {channel === "waba" && (t("authNoteWaba") || "WABA Meta: pegue o BM token no Meta Business Manager.")}
              {channel === "gupshup" && (t("authNoteGupshup") || "Gupshup: o WABA ID está em partner.gupshup.io/app; o BM token vem do Meta Business Manager (mesma WABA gerenciada pela Gupshup).")}
              {channel === "dialog360" && (t("authNoteDialog360") || "Dialog360: o WABA ID está no hub.360dialog.com; o BM token vem do Meta Business Manager (mesma WABA gerenciada pela Dialog360).")}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="data">{t("tabData") || "Dados WABA"}</TabsTrigger>
          <TabsTrigger value="analytics">{t("tabAnalytics") || "Conversation/Pricing"}</TabsTrigger>
          <TabsTrigger value="templates">{t("tabTemplates") || "Templates"}</TabsTrigger>
          <TabsTrigger value="limits">{t("tabLimits") || "Limites"}</TabsTrigger>
        </TabsList>

        <TabsContent value="data" className="space-y-3">
          <div className="flex gap-2">
            <Button onClick={handleLoadData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              {t("loadData") || "Carregar dados"}
            </Button>
          </div>
          {loading && <Skeleton className="h-40 w-full" />}
          {!loading && !wabaData && (
            <EmptyState
              icon={Building2}
              title={t("emptyDataTitle") || "Nenhum dado carregado"}
              description={t("emptyDataHint") || "Informe o WABA ID e o Business Token acima e clique em Carregar dados."}
            />
          )}
          {wabaData && accountView !== null && accountView !== "fallback" && (
            <Card>
              <CardHeader><CardTitle>{wabaData.name || wabaData.id}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
                  {accountView.known.map((f) => (
                    <div key={f.key}>
                      <dt className="text-xs text-muted-foreground">{f.label}</dt>
                      <dd className="text-sm font-medium break-all">{f.value}</dd>
                    </div>
                  ))}
                </dl>
                {accountView.other.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">{t("accountOtherFields") || "Outros campos"}</p>
                    <ul className="space-y-0.5">
                      {accountView.other.map((f) => (
                        <li key={f.key} className="text-xs break-all">
                          <span className="font-mono text-muted-foreground">{f.key}</span>: {f.value}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <RawDataDetails data={wabaData} label={rawDataLabel} />
              </CardContent>
            </Card>
          )}
          {wabaData && accountView === "fallback" && (
            <Card>
              <CardHeader><CardTitle>{wabaData.name || wabaData.id}</CardTitle></CardHeader>
              <CardContent>
                <pre className="text-xs overflow-auto max-h-96 bg-muted p-3 rounded">{JSON.stringify(wabaData, null, 2)}</pre>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label>{t("start") || "Início"}</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label>{t("end") || "Fim"}</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <div>
              <Label>{t("granularity") || "Granularidade"}</Label>
              <Select value={granularity} onValueChange={(v) => setGranularity(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="HALF_HOUR">{t("halfHour") || "Meia hora"}</SelectItem>
                  <SelectItem value="DAILY">{t("daily") || "Diário"}</SelectItem>
                  <SelectItem value="MONTHLY">{t("monthly") || "Mensal"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleLoadAnalytics} disabled={loading} className="w-full">
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                {t("loadAnalytics") || "Carregar analytics"}
              </Button>
            </div>
          </div>
          {loading && <Skeleton className="h-60 w-full" />}
          {!loading && !analytics && (
            <EmptyState
              icon={BarChart3}
              title={t("emptyAnalyticsTitle") || "Nenhuma métrica carregada"}
              description={t("emptyAnalyticsHint") || "Defina o período e clique em Carregar analytics para ver conversas e custos."}
            />
          )}
          {analytics && (
            <div className="space-y-4">
              {/* ── Conversas ── */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">{t("conversationAnalytics") || "Conversation Analytics"}</h3>
                {conversationView?.kind === "fallback" && (
                  <Card>
                    <CardContent className="pt-6">
                      <pre className="text-xs overflow-auto max-h-80 bg-muted p-3 rounded">{JSON.stringify(analytics.conversation_analytics, null, 2)}</pre>
                    </CardContent>
                  </Card>
                )}
                {conversationView?.kind === "missing" && (
                  <Card>
                    <CardContent className="py-6 text-sm text-muted-foreground">
                      {t("noConversationData") || "A resposta não trouxe dados de conversas."}
                    </CardContent>
                  </Card>
                )}
                {conversationView?.kind === "parsed" && conversationView.isEmpty && (
                  <Card>
                    <CardContent className="py-6 text-sm text-muted-foreground">
                      {t("noPeriodData") || "Nenhum dado no período selecionado."}
                    </CardContent>
                  </Card>
                )}
                {conversationView?.kind === "parsed" && !conversationView.isEmpty && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <StatCard
                        title={t("kpiTotalConversations") || "Conversas no período"}
                        value={conversationView.total}
                        icon={MessagesSquare}
                      />
                      {conversationView.hasCost && (
                        <StatCard
                          title={t("kpiTotalCost") || "Custo total estimado"}
                          value={formatCost(conversationView.totalCost, locale, accountCurrency)}
                          icon={Coins}
                          info={costInfo}
                        />
                      )}
                    </div>
                    <AreaChartCard
                      title={t("conversationsOverTime") || "Conversas ao longo do tempo"}
                      data={conversationView.series}
                    />
                    {conversationView.categories.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">{t("byCategory") || "Conversas por categoria"}</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {conversationView.categories.map((c) => (
                            <Card key={c.name}>
                              <CardContent className="p-4">
                                <p className="text-xs text-muted-foreground truncate" title={humanizeEnum(c.name)}>{humanizeEnum(c.name)}</p>
                                <p className="text-lg font-bold tabular-nums">{c.conversations.toLocaleString(locale)}</p>
                                {conversationView.hasCost && (
                                  <p className="text-xs text-muted-foreground tabular-nums">{formatCost(c.cost, locale, accountCurrency)}</p>
                                )}
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* ── Pricing ── */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">{t("pricingAnalytics") || "Pricing Analytics"}</h3>
                {pricingView?.kind === "fallback" && (
                  <Card>
                    <CardContent className="pt-6">
                      <pre className="text-xs overflow-auto max-h-80 bg-muted p-3 rounded">{JSON.stringify(analytics.pricing_analytics, null, 2)}</pre>
                    </CardContent>
                  </Card>
                )}
                {pricingView?.kind === "missing" && (
                  <Card>
                    <CardContent className="py-6 text-sm text-muted-foreground">
                      {t("noPricingData") || "A resposta não trouxe dados de cobrança."}
                    </CardContent>
                  </Card>
                )}
                {pricingView?.kind === "parsed" && pricingView.isEmpty && (
                  <Card>
                    <CardContent className="py-6 text-sm text-muted-foreground">
                      {t("noPeriodData") || "Nenhum dado no período selecionado."}
                    </CardContent>
                  </Card>
                )}
                {pricingView?.kind === "parsed" && !pricingView.isEmpty && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <StatCard
                        title={t("kpiTotalVolume") || "Volume total"}
                        value={pricingView.totalVolume}
                        icon={BarChart3}
                      />
                      {pricingView.hasCost && (
                        <StatCard
                          title={t("kpiTotalCost") || "Custo total estimado"}
                          value={formatCost(pricingView.totalCost, locale, accountCurrency)}
                          icon={Coins}
                          info={costInfo}
                        />
                      )}
                    </div>
                    {pricingView.hasNamedCategory ? (
                      pricingView.multiCountry ? (
                        <StackedBarChartCard
                          title={t("pricingByCategory") || "Volume por categoria de cobrança"}
                          rows={pricingView.stackedRows}
                        />
                      ) : (
                        <BarChartCard
                          title={t("pricingByCategory") || "Volume por categoria de cobrança"}
                          data={pricingView.barData}
                        />
                      )
                    ) : (
                      <AreaChartCard
                        title={t("pricingOverTime") || "Volume ao longo do tempo"}
                        data={pricingView.series}
                      />
                    )}
                  </>
                )}
              </div>

              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 shrink-0" />
                {t("analyticsNote") || "Os números vêm diretamente da Meta e podem levar algumas horas para consolidar; custos são estimativas."}
              </p>
              <RawDataDetails data={analytics} label={rawDataLabel} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="templates" className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>{t("start") || "Início"}</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label>{t("end") || "Fim"}</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button onClick={handleLoadTemplates} disabled={loading} className="w-full">
                <FileBarChart className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                {t("loadTemplates") || "Carregar templates"}
              </Button>
            </div>
          </div>
          {loading && <Skeleton className="h-40 w-full" />}
          {!loading && !tplAnalytics && (
            <EmptyState
              icon={FileBarChart}
              title={t("emptyTemplatesTitle") || "Nenhuma métrica de template carregada"}
              description={t("emptyTemplatesHint") || "Defina o período e clique em Carregar templates para ver enviados, entregues e lidos."}
            />
          )}
          {tplAnalytics && templatesView?.kind === "parsed" && (
            <Card>
              <CardHeader><CardTitle>{t("templateAnalytics") || "Template Analytics"}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {templatesView.rows.length === 0 ? (
                  <p className="py-4 text-sm text-muted-foreground">{t("noPeriodData") || "Nenhum dado no período selecionado."}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="text-left p-2">{t("tplColTemplate") || "Template"}</th>
                          <th className="text-right p-2">{t("tplColSent") || "Enviados"}</th>
                          <th className="text-right p-2">{t("tplColDelivered") || "Entregues"}</th>
                          <th className="text-right p-2">{t("tplColRead") || "Lidos"}</th>
                          {templatesView.hasClicks && <th className="text-right p-2">{t("tplColClicked") || "Cliques"}</th>}
                          <th className="text-right p-2" title={t("tplReadRateHint") || "Percentual de mensagens lidas em relação às entregues."}>
                            {t("tplColReadRate") || "Taxa de leitura"}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {templatesView.rows.map((r) => (
                          <tr key={r.id} className="border-t">
                            <td className="p-2 font-mono text-xs break-all">{r.name}</td>
                            <td className="p-2 text-right tabular-nums">{r.sent.toLocaleString(locale)}</td>
                            <td className="p-2 text-right tabular-nums">{r.delivered.toLocaleString(locale)}</td>
                            <td className="p-2 text-right tabular-nums">{r.read.toLocaleString(locale)}</td>
                            {templatesView.hasClicks && <td className="p-2 text-right tabular-nums">{r.clicked.toLocaleString(locale)}</td>}
                            <td className="p-2 text-right tabular-nums">{readRate(r.read, r.delivered)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t bg-muted/50 font-medium">
                          <td className="p-2">{t("tplTotals") || "Totais"}</td>
                          <td className="p-2 text-right tabular-nums">{templatesView.totals.sent.toLocaleString(locale)}</td>
                          <td className="p-2 text-right tabular-nums">{templatesView.totals.delivered.toLocaleString(locale)}</td>
                          <td className="p-2 text-right tabular-nums">{templatesView.totals.read.toLocaleString(locale)}</td>
                          {templatesView.hasClicks && <td className="p-2 text-right tabular-nums">{templatesView.totals.clicked.toLocaleString(locale)}</td>}
                          <td className="p-2 text-right tabular-nums">{readRate(templatesView.totals.read, templatesView.totals.delivered)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
                <RawDataDetails data={tplAnalytics} label={rawDataLabel} />
              </CardContent>
            </Card>
          )}
          {tplAnalytics && templatesView?.kind === "fallback" && (
            <Card>
              <CardHeader><CardTitle>{t("templateAnalytics") || "Template Analytics"}</CardTitle></CardHeader>
              <CardContent>
                <pre className="text-xs overflow-auto max-h-96 bg-muted p-3 rounded">{JSON.stringify(tplAnalytics, null, 2)}</pre>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="limits" className="space-y-3">
          <Button onClick={handleLoadLimits} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            {t("loadLimits") || "Carregar limites"}
          </Button>
          {loading && <Skeleton className="h-40 w-full" />}
          {!loading && !limits && (
            <EmptyState
              icon={Gauge}
              title={t("emptyLimitsTitle") || "Nenhuma informação carregada"}
              description={t("emptyLimitsHint") || "Clique em Carregar limites para ver os tiers de envio."}
            />
          )}
          {limits && (
            <Card>
              <CardHeader><CardTitle>{t("limitsInfo") || "Limites e Tiers"}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-2">Tier</th>
                        <th className="text-right p-2">{t("uniqueCustomers24h") || "Únicos / 24h"}</th>
                        <th className="text-left p-2">{t("desc") || "Descrição"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(limits.messaging_tiers || []).map((tier: any) => (
                        <tr key={tier.tier} className="border-t">
                          <td className="p-2 font-mono">{tier.tier}</td>
                          <td className="p-2 text-right">{tier.unique_customers_24h ?? "∞"}</td>
                          <td className="p-2">{tier.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">{limits.api_limitation_note}</AlertDescription>
                </Alert>
                <a href={limits.documentation_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                  {t("docLink") || "Documentação oficial"}
                </a>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
