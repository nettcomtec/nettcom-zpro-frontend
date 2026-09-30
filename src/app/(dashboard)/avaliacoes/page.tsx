"use client";

import { formatDate as formatDateIntl } from "@/lib/format";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { displayContactIdentity } from "@/lib/contact-identity";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Star, Search, Trash2, ChevronLeft, ChevronRight, RefreshCw, ExternalLink, Settings, Save, Eye, BarChart3, TrendingUp, Users, Percent, ThumbsUp, ThumbsDown, Minus, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { StatCard } from "@/components/charts/stat-card";
import { BarChartCard } from "@/components/charts/bar-chart-card";
import { PieChartCard } from "@/components/charts/pie-chart-card";
import {
  fetchEvaluations, deleteEvaluation, fetchEvaluationConfig,
  updateRatings, updateTenantRatingData, fetchNpsReport,
  type TicketEvaluation, type RatingItem, type NpsReport,
} from "@/services/evaluations";
import { useAuthStore } from "@/stores/auth-store";
import { usePageAccess } from "@/hooks/use-page-access";
import { useLiveMode } from "@/hooks/use-live-mode";
import { cn } from "@/lib/utils";
import { AccessDenied } from "@/components/layout/access-denied";
import { EspiarConversaDialog, type TicketForSpy } from "@/components/atendimento/espiar-conversa-dialog";

const TIME_OPTIONS_VALUES = [
  { minutes: 1, value: String(1 * 60000) },
  { minutes: 5, value: String(5 * 60000) },
  { minutes: 10, value: String(10 * 60000) },
  { minutes: 15, value: String(15 * 60000) },
  { minutes: 30, value: String(30 * 60000) },
  { minutes: 60, value: String(60 * 60000) },
  { minutes: 120, value: String(120 * 60000) },
  { minutes: 360, value: String(360 * 60000) },
  { minutes: 720, value: String(720 * 60000) },
  { minutes: 1440, value: String(1440 * 60000) },
  { minutes: 2880, value: String(2880 * 60000) },
  { minutes: 10080, value: String(10080 * 60000) },
];

function StarRating({ rating, max = 5 }: { rating: number; max?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: Math.max(1, max) }).map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i < rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
        />
      ))}
    </div>
  );
}

/** Nota gravada é STRING no backend e pode ser texto (pesquisa pendente) — nunca coagir às cegas. */
function numericScore(value: unknown): number | null {
  const s = String(value ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ─── Config Tab ────────────────────────────────────────────────────
function ConfigTab() {
  const t = useTranslations("avaliacoesPage");
  const { user } = useAuthStore();
  const tenantId = user?.tenantId ?? 1;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const DEFAULT_RATINGS: RatingItem[] = [
    { rating: 0, label: t("ratingBad"), message: "" },
    { rating: 1, label: t("ratingRegular"), message: "" },
    { rating: 2, label: t("ratingGood"), message: "" },
    { rating: 3, label: t("ratingVeryGood"), message: "" },
    { rating: 4, label: t("ratingExcellent"), message: "" },
    { rating: 5, label: t("ratingIncredible"), message: "" },
  ];

  const TIME_OPTIONS = [
    ...TIME_OPTIONS_VALUES.map((o) => ({ label: t(`time_${o.minutes}`), value: o.value })),
    { label: t("timeCustom"), value: "custom" },
  ];

  const [ratings, setRatings] = useState<RatingItem[]>(DEFAULT_RATINGS);
  const [ratingStore, setRatingStore] = useState("");
  const [ratingStoreError, setRatingStoreError] = useState("");
  const [ratingStoreAttemp, setRatingStoreAttemp] = useState("");
  const [ratingStoreTimePreset, setRatingStoreTimePreset] = useState("");
  const [ratingStoreTimeCustom, setRatingStoreTimeCustom] = useState("");
  const [ratingStoreUse, setRatingStoreUse] = useState("disabled");
  const [ratingPrivacy, setRatingPrivacy] = useState("disabled");
  const [ratingMaxScore, setRatingMaxScore] = useState(5);
  const [ratingPromoterMin, setRatingPromoterMin] = useState(5);
  const [ratingDetractorMax, setRatingDetractorMax] = useState(3);
  const [ratingMode, setRatingMode] = useState("native");
  const [ratingExternalUrl, setRatingExternalUrl] = useState("");
  const [ratingCloseBehavior, setRatingCloseBehavior] = useState("ask");
  const [ratingCloseTimerMinutes, setRatingCloseTimerMinutes] = useState(30);
  const [configTenantId, setConfigTenantId] = useState<number>(tenantId);

  useEffect(() => {
    fetchEvaluationConfig()
      .then(({ data }) => {
        const d = Array.isArray(data) ? data[0] : data;
        if (!d) return;
        setConfigTenantId(d.id || tenantId);
        if (Array.isArray(d.rating)) setRatings(d.rating);
        setRatingStore(d.ratingStore || "");
        setRatingStoreError(d.ratingStoreError || "");
        setRatingStoreAttemp(d.ratingStoreAttemp || "");
        setRatingStoreUse(d.ratingStoreUse || "disabled");
        setRatingPrivacy(d.ratingPrivacy || "disabled");
        setRatingMaxScore(d.ratingMaxScore ?? 5);
        setRatingPromoterMin(d.ratingPromoterMin ?? 5);
        setRatingDetractorMax(d.ratingDetractorMax ?? 3);
        setRatingMode(d.ratingMode || "native");
        setRatingExternalUrl(d.ratingExternalUrl || "");
        setRatingCloseBehavior(d.ratingCloseBehavior || "ask");
        setRatingCloseTimerMinutes(d.ratingCloseTimerMinutes ?? 30);
        const t = d.ratingStoreTime || "";
        const found = TIME_OPTIONS.find((o) => o.value === t);
        if (found) {
          setRatingStoreTimePreset(found.value);
          setRatingStoreTimeCustom("");
        } else {
          setRatingStoreTimePreset("custom");
          const ms = parseInt(t || "0", 10);
          setRatingStoreTimeCustom(isNaN(ms) ? "" : String(Math.round(ms / 60000)));
        }
      })
      .catch(() => toast.error(t("errorLoadConfig")))
      .finally(() => setLoading(false));
  }, [tenantId]);

  // Casa por identidade (r.rating), nunca por índice: os cards renderizam o array FILTRADO
  // pelo teto e um array fora de ordem faria o índice editar o card errado.
  const updateRating = (rating: number, field: keyof RatingItem, value: string) => {
    setRatings((prev) => prev.map((r) => r.rating === rating ? { ...r, [field]: value } : r));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateRatings(ratings);

      let timeToSend = ratingStoreTimePreset;
      if (ratingStoreTimePreset === "custom") {
        const minutes = parseInt(ratingStoreTimeCustom || "0", 10);
        timeToSend = isNaN(minutes) ? "" : String(minutes * 60000);
      }

      const evaluationMessages = ratings.map((r) => ({
        rating: String(r.rating),
        message: r.message,
      }));

      await updateTenantRatingData(configTenantId, {
        id: configTenantId,
        rating: ratings,
        ratingStore,
        ratingStoreError,
        ratingStoreAttemp,
        ratingStoreTime: timeToSend,
        ratingStoreUse,
        evaluationMessage: JSON.stringify(evaluationMessages),
        ratingPrivacy,
        ratingMaxScore,
        ratingPromoterMin,
        ratingDetractorMax,
        ratingMode,
        ratingExternalUrl: ratingExternalUrl.trim(),
        ratingCloseBehavior,
        ratingCloseTimerMinutes,
      });

      toast.success(t("successSaveConfig"));
    } catch {
      toast.error(t("errorSaveConfig"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-4">
      {/* ── Modo de avaliação: Nota Nativa vs Link Externo ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("ratingModeTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("ratingModeLabel")}</Label>
            <Select value={ratingMode} onValueChange={setRatingMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="native">{t("ratingModeNative")}</SelectItem>
                <SelectItem value="link">{t("ratingModeLink")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {ratingMode === "link" ? t("ratingModeLinkDesc") : t("ratingModeNativeDesc")}
            </p>
          </div>
          {ratingMode === "link" && (
            <div className="space-y-2">
              <Label>{t("ratingExternalUrlLabel")}</Label>
              <Input
                value={ratingExternalUrl}
                onChange={(e) => setRatingExternalUrl(e.target.value)}
                placeholder={t("ratingExternalUrlPlaceholder")}
              />
              <p className="text-xs text-muted-foreground">
                {t("ratingExternalUrlVarsHint")}{" "}
                <code className="text-[11px]">{"{{protocolo}} {{ticketId}} {{contato}} {{numero}} {{atendente}}"}</code>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Comportamento pós-avaliação (fechamento do ticket) ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("closeBehaviorCardTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>{t("closeBehaviorLabel")}</Label>
            <p className="text-xs text-muted-foreground">{t("closeBehaviorHint")}</p>
          </div>
          <RadioGroup value={ratingCloseBehavior} onValueChange={setRatingCloseBehavior} className="space-y-2">
            {[
              { v: "ask", label: t("closeBehaviorAsk"), desc: t("closeBehaviorAskDesc") },
              { v: "closeOnResolve", label: t("closeBehaviorCloseOnResolve"), desc: t("closeBehaviorCloseOnResolveDesc") },
              { v: "waitClientReply", label: t("closeBehaviorWaitReply"), desc: t("closeBehaviorWaitReplyDesc") },
              { v: "timer", label: t("closeBehaviorTimer"), desc: t("closeBehaviorTimerDesc") },
            ].map((opt) => (
              <label key={opt.v} htmlFor={`rcb-${opt.v}`} className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/40">
                <RadioGroupItem value={opt.v} id={`rcb-${opt.v}`} className="mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                </div>
              </label>
            ))}
          </RadioGroup>
          {ratingCloseBehavior === "timer" && (
            <div className="space-y-2 max-w-xs">
              <Label>{t("closeBehaviorTimerMinutesLabel")}</Label>
              <Input
                type="number"
                min="1"
                value={ratingCloseTimerMinutes}
                onChange={(e) => setRatingCloseTimerMinutes(Math.max(1, parseInt(e.target.value || "1", 10) || 1))}
                placeholder={t("closeBehaviorTimerMinutesPlaceholder")}
              />
            </div>
          )}
          {(ratingCloseBehavior === "closeOnResolve" || ratingCloseBehavior === "timer") && ratingStoreUse !== "enabled" && (
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">{t("closeBehaviorStoreUseWarning")}</p>
          )}
          {ratingMode === "link" && (
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">{t("closeBehaviorLinkModeNote")}</p>
          )}
          <p className="text-xs text-muted-foreground">{t("closeBehaviorChannelNote")}</p>
        </CardContent>
      </Card>

      {ratingMode === "native" && (<>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("ratingsCardTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ratings.filter((r) => r.rating <= ratingMaxScore).map((r) => (
              <div key={r.rating} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <StarRating rating={r.rating} max={ratingMaxScore} />
                  <span className="text-sm font-medium">{t("ratingLabel")} {r.rating}</span>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("labelFieldLabel")}</Label>
                  <Input
                    value={r.label}
                    onChange={(e) => updateRating(r.rating, "label", e.target.value)}
                    placeholder={t("labelFieldPlaceholder")}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t("responseMessageLabel")}</Label>
                  <Textarea
                    value={r.message}
                    onChange={(e) => updateRating(r.rating, "message", e.target.value)}
                    placeholder={t("responseMessagePlaceholder")}
                    rows={2}
                    className="text-sm"
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("generalSettingsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("storeMessageLabel")}</Label>
            <Input value={ratingStore} onChange={(e) => setRatingStore(e.target.value)} placeholder={t("storeMessagePlaceholder")} />
          </div>
          <div className="space-y-2">
            <Label>{t("errorMessageLabel")}</Label>
            <Input value={ratingStoreError} onChange={(e) => setRatingStoreError(e.target.value)} placeholder={t("errorMessagePlaceholder")} />
          </div>
          <div className="space-y-2">
            <Label>{t("attemptMessageLabel")}</Label>
            <Input value={ratingStoreAttemp} onChange={(e) => setRatingStoreAttemp(e.target.value)} placeholder={t("attemptMessagePlaceholder")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>{t("timeLabel")}</Label>
              <Select value={ratingStoreTimePreset} onValueChange={setRatingStoreTimePreset}>
                <SelectTrigger><SelectValue placeholder={t("timePlaceholder")} /></SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{t("enableRatingsLabel")}</p>
                <p className="text-xs text-muted-foreground">{t("enableRatingsDescription")}</p>
              </div>
              <Switch
                checked={ratingStoreUse === "enabled"}
                onCheckedChange={(v) => setRatingStoreUse(v ? "enabled" : "disabled")}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{t("ratingPrivacyLabel")}</p>
                <p className="text-xs text-muted-foreground">{t("ratingPrivacyDescription")}</p>
              </div>
              <Switch
                checked={ratingPrivacy === "enabled"}
                onCheckedChange={(v) => setRatingPrivacy(v ? "enabled" : "disabled")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("ratingMaxScoreLabel")}</Label>
              <Select value={String(ratingMaxScore)} onValueChange={(v) => {
                const nv = Number(v);
                setRatingMaxScore(nv);
                if (ratingPromoterMin > nv) setRatingPromoterMin(Math.max(1, nv));
                if (ratingDetractorMax >= Math.max(1, nv)) setRatingDetractorMax(Math.max(0, Math.max(1, nv) - 1));
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>{t("ratingMaxScoreOption", { n })}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("ratingMaxScoreNote")}</p>
            </div>
          </div>
          {ratingStoreTimePreset === "custom" && (
            <div className="space-y-2">
              <Label>{t("customMinutesLabel")}</Label>
              <Input
                type="number"
                min="0"
                value={ratingStoreTimeCustom}
                onChange={(e) => setRatingStoreTimeCustom(e.target.value)}
                placeholder={t("customMinutesPlaceholder")}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("npsClassificationTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("npsClassificationDesc")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("promoterMinLabel")}</Label>
              <Select
                value={String(ratingPromoterMin)}
                onValueChange={(v) => {
                  const nv = Number(v);
                  setRatingPromoterMin(nv);
                  if (ratingDetractorMax >= nv) setRatingDetractorMax(Math.max(0, nv - 1));
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: Math.max(1, ratingMaxScore) }, (_, i) => i + 1).map((nv) => (
                    <SelectItem key={nv} value={String(nv)}>{t("scoreGte", { n: nv })}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("detractorMaxLabel")}</Label>
              <Select value={String(ratingDetractorMax)} onValueChange={(v) => setRatingDetractorMax(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: Math.max(1, ratingPromoterMin) }, (_, i) => i).map((nv) => (
                    <SelectItem key={nv} value={String(nv)}>{t("scoreLte", { n: nv })}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1.5">
            <p className="font-medium">{t("npsPreviewTitle")}</p>
            <p className="flex items-center gap-2"><ThumbsUp className="h-3.5 w-3.5 text-emerald-500" />{t("npsPreviewPromoter", { min: ratingPromoterMin, max: ratingMaxScore })}</p>
            <p className="flex items-center gap-2"><Minus className="h-3.5 w-3.5 text-amber-500" />{t("npsPreviewNeutral", { low: ratingDetractorMax + 1, high: ratingPromoterMin - 1 })}</p>
            <p className="flex items-center gap-2"><ThumbsDown className="h-3.5 w-3.5 text-red-500" />{t("npsPreviewDetractor", { max: ratingDetractorMax })}</p>
          </div>
        </CardContent>
      </Card>
      </>)}

      <Button onClick={handleSave} disabled={saving}>
        {saving ? t("saving") : <><Save className="mr-2 h-4 w-4" /> {t("saveConfig")}</>}
      </Button>
    </div>
  );
}

// ─── List Tab ────────────────────────────────────────────────────
function ListTab() {
  const t = useTranslations("avaliacoesPage");
  const { isLiveMode } = useLiveMode();
  const router = useRouter();
  const [items, setItems] = useState<TicketEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filterRating, setFilterRating] = useState<string>("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [deleting, setDeleting] = useState<TicketEvaluation | null>(null);
  const [spyOpen, setSpyOpen] = useState(false);
  const [spyTicket, setSpyTicket] = useState<TicketForSpy | null>(null);
  const [maxScore, setMaxScore] = useState(5);
  const limit = 20;

  useEffect(() => {
    // Escala da avaliação (Pontuação máxima). Backend antigo sem o campo (ou falha) → 5 = comportamento atual.
    fetchEvaluationConfig()
      .then(({ data }) => {
        const d = Array.isArray(data) ? data[0] : data;
        if (d && typeof d.ratingMaxScore === "number") setMaxScore(d.ratingMaxScore);
      })
      .catch(() => { /* silencioso — a listagem não depende da config */ });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await fetchEvaluations({
        page, limit,
        search: search || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        evaluation: filterRating && filterRating !== "all" ? Number(filterRating) : undefined,
      });
      const list = data?.data ?? (Array.isArray(data) ? data : []);
      setItems(list);
      setTotalCount(data?.total ?? list.length);
      setHasMore(page < (data?.totalPages ?? 1));
    } catch {
      toast.error(t("errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [page, search, startDate, endDate, filterRating]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, startDate, endDate, filterRating]);

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteEvaluation(deleting.id);
      toast.success(t("successDeleted"));
      setDeleting(null);
      load();
    } catch {
      toast.error(t("errorDelete"));
    }
  };

  const formatDate = (d: string) => {
    try {
      return formatDateIntl(new Date(d), { day: "2-digit", month: "2-digit", year: "numeric" });
    } catch { return d; }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  // Teto ÚNICO da tabela: escala atual OU a maior nota visível (histórico gravado com teto
  // antigo nunca é truncado) — evita linhas com quantidades diferentes de estrelas.
  const tableMax = Math.max(maxScore, ...items.map((ev) => numericScore(ev.evaluation) ?? 0));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("searchPlaceholder")} className="pl-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("startDate")}</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("endDate")}</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("ratingFilterLabel")}</Label>
          <Select value={filterRating} onValueChange={setFilterRating}>
            <SelectTrigger className="w-28"><SelectValue placeholder={t("allRatings")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allRatings")}</SelectItem>
              {Array.from({ length: maxScore + 1 }, (_, i) => i).map((n) => (
                <SelectItem key={n} value={String(n)}>{n} {n !== 1 ? t("stars") : t("star")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="icon" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Star} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("colTicket")}</TableHead>
                    <TableHead>{t("colContact")}</TableHead>
                    <TableHead>
                      <span className="inline-flex items-center gap-1">
                        {t("colAgent")}
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" aria-label={t("colAgentTooltip")} className="text-muted-foreground hover:text-foreground">
                                <Info className="h-3.5 w-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs font-normal">
                              {t("colAgentTooltip")}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </span>
                    </TableHead>
                    <TableHead>{t("colRating")}</TableHead>
                    <TableHead>{t("colDate")}</TableHead>
                    <TableHead className="w-24">{t("colActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((ev) => (
                    <TableRow key={ev.id}>
                      <TableCell className="text-muted-foreground">#{ev.ticketId}</TableCell>
                      <TableCell>
                        {ev.ticket?.contact?.name ? (
                          <div className="flex flex-col leading-tight">
                            <span className={cn("text-sm font-medium truncate max-w-[200px]", isLiveMode && "live-blur-text")}>{ev.ticket.contact.name}</span>
                            {displayContactIdentity(ev.ticket.contact) && (
                              <span className={cn("text-xs text-muted-foreground", isLiveMode && "live-blur-text")}>{displayContactIdentity(ev.ticket.contact)}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>{ev.user?.name || ev.ticket?.user?.name || "—"}</TableCell>
                      <TableCell>
                        {ev.type === "external" ? (
                          ev.externalUrl ? (
                            <a
                              href={ev.externalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={ev.externalUrl}
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline max-w-[220px] truncate"
                            >
                              <ExternalLink className="h-3 w-3 shrink-0" /> {t("externalBadge")}
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">{t("externalBadge")}</span>
                          )
                        ) : (
                          <StarRating rating={numericScore(ev.evaluation) ?? 0} max={tableMax} />
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(ev.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" title={t("viewConversation")}
                            onClick={() => { setSpyTicket({ id: ev.ticketId, contact: ev.ticket?.contact }); setSpyOpen(true); }}>
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title={t("goToAttendance")}
                            onClick={() => router.push(`/atendimento?ticket=${ev.ticketId}`)}>
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleting(ev)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{totalCount} {totalCount !== 1 ? t("evaluations") : t("evaluation")}</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">{t("page")} {page} {t("of")} {totalPages}</span>
              <Button variant="outline" size="sm" disabled={!hasMore && page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      <Dialog open={!!deleting} onOpenChange={() => setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteCannotUndo")}</DialogDescription>
          </DialogHeader>
          <p className="py-4 text-sm text-muted-foreground">
            {t("deleteConfirm")} <strong>#{deleting?.ticketId}</strong>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={handleDelete}>{t("remove")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EspiarConversaDialog
        open={spyOpen}
        onOpenChange={setSpyOpen}
        ticket={spyTicket}
      />
    </div>
  );
}

// ─── NPS Report Tab ──────────────────────────────────────────────
const NPS_GREEN = "hsl(160, 60%, 45%)";
const NPS_AMBER = "hsl(45, 90%, 50%)";
const NPS_RED = "hsl(0, 70%, 55%)";

const isoDate = (d: Date) => {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
};

function npsZoneKey(nps: number): string {
  if (nps >= 75) return "npsZoneExcellent";
  if (nps >= 50) return "npsZoneGreat";
  if (nps >= 0) return "npsZoneOk";
  return "npsZoneCritical";
}

function npsColorClass(nps: number): string {
  if (nps >= 50) return "text-emerald-600 dark:text-emerald-400";
  if (nps >= 0) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function NpsReportTab() {
  const t = useTranslations("avaliacoesPage");
  const [report, setReport] = useState<NpsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => isoDate(new Date(Date.now() - 29 * 86400000)));
  const [endDate, setEndDate] = useState(() => isoDate(new Date()));
  const [granularity, setGranularity] = useState("day");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await fetchNpsReport({ startDate, endDate, granularity });
      setReport(data);
    } catch {
      toast.error(t("errorLoadReport"));
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, granularity]);

  useEffect(() => { load(); }, [load]);

  const setQuickRange = (days: number) => {
    setStartDate(isoDate(new Date(Date.now() - (days - 1) * 86400000)));
    setEndDate(isoDate(new Date()));
    setGranularity(days > 62 ? "month" : "day");
  };

  const tooltipStyle = {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    fontSize: 12,
    color: "hsl(var(--card-foreground))",
  };

  const renderGroupTable = (title: string, firstColLabel: string, rows: NpsReport["byAgent"]) => (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{title}</CardTitle></CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        {rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">{t("noDataReport")}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{firstColLabel}</TableHead>
                <TableHead className="text-right">{t("colResponses")}</TableHead>
                <TableHead className="text-right">{t("colNps")}</TableHead>
                <TableHead className="text-right">{t("colCsat")}</TableHead>
                <TableHead className="text-right">{t("colPromoterPct")}</TableHead>
                <TableHead className="text-right">{t("colDetractorPct")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={`${r.id ?? "x"}-${i}`}>
                  <TableCell className="font-medium">{r.name || t("unknown")}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{r.total}</TableCell>
                  <TableCell className={cn("text-right font-semibold tabular-nums", npsColorClass(r.nps))}>{r.nps}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.csatAvg.toFixed(1)}</TableCell>
                  <TableCell className="text-right text-emerald-600 dark:text-emerald-400 tabular-nums">{r.promoterPct}%</TableCell>
                  <TableCell className="text-right text-red-600 dark:text-red-400 tabular-nums">{r.detractorPct}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">{t("startDate")}</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("endDate")}</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t("granularityLabel")}</Label>
          <Select value={granularity} onValueChange={setGranularity}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="day">{t("granularityDay")}</SelectItem>
              <SelectItem value="week">{t("granularityWeek")}</SelectItem>
              <SelectItem value="month">{t("granularityMonth")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-1">
          <Button variant="outline" size="sm" onClick={() => setQuickRange(7)}>{t("last7Days")}</Button>
          <Button variant="outline" size="sm" onClick={() => setQuickRange(30)}>{t("last30Days")}</Button>
          <Button variant="outline" size="sm" onClick={() => setQuickRange(90)}>{t("last90Days")}</Button>
        </div>
        <Button variant="outline" size="icon" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">{t("npsFormulaHint")}</p>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : !report || report.summary.total === 0 ? (
        <EmptyState icon={BarChart3} title={t("emptyTitle")} description={t("noDataReport")} />
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title={t("npsScore")} value={report.summary.nps} icon={TrendingUp} description={t(npsZoneKey(report.summary.nps))} delay={0} />
            <StatCard title={t("csatAvg")} value={report.summary.csatAvg.toFixed(1)} icon={Star} description={t("csatOutOf", { max: report.cutoffs.maxScore })} delay={1} />
            <StatCard title={t("totalResponses")} value={report.summary.total} icon={Users} delay={2} />
            <StatCard title={t("responseRate")} value={`${report.responseRate.rate}%`} icon={Percent} description={t("responseRateApprox")} delay={3} />
          </div>

          {/* Breakdown + Distribuição */}
          <div className="grid gap-4 lg:grid-cols-2">
            <PieChartCard
              title={t("npsBreakdown")}
              donut
              data={[
                { name: t("promoters"), value: report.summary.promoters, color: NPS_GREEN },
                { name: t("passives"), value: report.summary.neutrals, color: NPS_AMBER },
                { name: t("detractors"), value: report.summary.detractors, color: NPS_RED },
              ]}
            />
            <BarChartCard
              title={t("distributionByScore")}
              data={report.distribution.map((d) => ({
                name: String(d.score),
                value: d.count,
                color: d.score >= report.cutoffs.promoterMin ? NPS_GREEN : d.score <= report.cutoffs.detractorMax ? NPS_RED : NPS_AMBER,
              }))}
            />
          </div>

          {/* Tendências */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t("npsTrend")}</CardTitle></CardHeader>
              <CardContent>
                {report.trend.length === 0 ? (
                  <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">{t("noDataReport")}</div>
                ) : (
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={report.trend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="period" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                        <YAxis domain={[-100, 100]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                        <ReferenceLine y={0} stroke="hsl(var(--border))" />
                        <RechartsTooltip contentStyle={tooltipStyle} />
                        <Line type="monotone" dataKey="nps" name={t("npsScore")} stroke="hsl(220, 70%, 50%)" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t("percentTrend")}</CardTitle></CardHeader>
              <CardContent>
                {report.trend.length === 0 ? (
                  <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">{t("noDataReport")}</div>
                ) : (
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={report.trend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="period" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                        <YAxis domain={[0, 100]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                        <RechartsTooltip contentStyle={tooltipStyle} />
                        <Line type="monotone" dataKey="promoterPct" name={t("promoters")} stroke={NPS_GREEN} strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="neutralPct" name={t("passives")} stroke={NPS_AMBER} strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="detractorPct" name={t("detractors")} stroke={NPS_RED} strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Rankings */}
          {renderGroupTable(t("byAgent"), t("colAgent"), report.byAgent)}
          <div className="grid gap-4 lg:grid-cols-2">
            {renderGroupTable(t("byQueue"), t("colQueue"), report.byQueue)}
            {renderGroupTable(t("byChannel"), t("colChannel"), report.byChannel)}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────
export default function AvaliacoesPage() {
  const t = useTranslations("avaliacoesPage");
  const allowed = usePageAccess("avaliacoes", { adminSuperOnly: true });
  if (!allowed) return <AccessDenied />;
  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
            { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
          ],
        }}
      />
      <Tabs defaultValue="listar">
        <TabsList>
          <TabsTrigger value="listar"><Star className="mr-2 h-4 w-4" />{t("tabList")}</TabsTrigger>
          <TabsTrigger value="relatorio"><BarChart3 className="mr-2 h-4 w-4" />{t("tabNps")}</TabsTrigger>
          <TabsTrigger value="configurar"><Settings className="mr-2 h-4 w-4" />{t("tabConfig")}</TabsTrigger>
        </TabsList>
        <TabsContent value="listar" className="mt-4 pb-8"><ListTab /></TabsContent>
        <TabsContent value="relatorio" className="mt-4 pb-8"><NpsReportTab /></TabsContent>
        <TabsContent value="configurar" className="mt-4 pb-8"><ConfigTab /></TabsContent>
      </Tabs>
    </div>
  );
}
