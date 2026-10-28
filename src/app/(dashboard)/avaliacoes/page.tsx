"use client";

import { formatDate as formatDateIntl, getActiveLocale } from "@/lib/format";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
import { Star, Search, Trash2, ChevronLeft, ChevronRight, RefreshCw, ExternalLink, Settings, Save, Eye, BarChart3, TrendingUp, Users, Percent, ThumbsUp, ThumbsDown, Minus, Info, AlertTriangle, Store, Download, FileSpreadsheet, FileText, Loader2, Lock } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { fetchAllUsers, type User } from "@/services/users";
import {
  buildCsv, csvCell, csvDateTimeText, csvDelimiterForCountry, csvDigitsCell,
  excelDateTimeFormat, excelSerialFromLocalDate, sanitizeFileNamePart,
} from "@/lib/csv-export";
import { canDownloadFiles, downloadFile } from "@/lib/download-file";
import {
  EXPORT_MAX_PAGES, EXPORT_MAX_ROWS, EXPORT_PAGE_SIZE,
  buildEvaluationExportRows, evaluationStatus, isNewEvaluationsBackend,
  type EvaluationExportRow, type EvaluationExportStatus,
} from "@/lib/evaluation-export";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { StatCard } from "@/components/charts/stat-card";
import { BarChartCard } from "@/components/charts/bar-chart-card";
import { PieChartCard } from "@/components/charts/pie-chart-card";
import {
  fetchEvaluations, deleteEvaluation, fetchEvaluationConfig,
  updateRatings, updateTenantRatingData, fetchNpsReport,
  isValidGoogleReviewUrl, GOOGLE_REVIEW_URL_MAX, GOOGLE_REVIEW_TEXT_MAX,
  type TicketEvaluation, type RatingItem, type NpsReport,
} from "@/services/evaluations";
import { loadGoogleBusinessStatus } from "@/services/google-business";
import { getBackendErrorCode } from "@/lib/backend-error-code";
import GoogleReviewsTab from "@/components/avaliacoes/google/google-reviews-tab";
import { useAuthStore } from "@/stores/auth-store";
import { useRegion } from "@/hooks/use-region";
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

/** Variável de sistema com o link de avaliação do Google (resolvida no backend). */
const GOOGLE_REVIEW_LINK_VAR = "{{linkAvaliacaoGoogle}}";

/**
 * Texto padrão do pedido de avaliação no Google quando a empresa não define idioma:
 * espelho do catálogo `rating.googleReview` (pt) do backend — é o que o cliente recebe.
 */
const GOOGLE_REVIEW_DEFAULT_PT = "Se puder, conte também no Google como foi o seu atendimento: {link}";

/** Recusas do backend no save do pedido de avaliação no Google → chave da tela. */
const GOOGLE_REVIEW_ERROR_KEYS: Record<string, string> = {
  ERR_GOOGLE_REVIEW_URL_INVALID: "googleReviewUrlInvalid",
  ERR_GOOGLE_REVIEW_TEXT_TOO_LONG: "googleReviewTextTooLong",
  ERR_GOOGLE_REVIEW_TEXT_INVALID: "googleReviewTextInvalid",
  ERR_GOOGLE_REVIEW_TOGGLE_INVALID: "googleReviewToggleInvalid",
};

/** Mesma normalização do backend antes de medir o texto. */
const normalizeGoogleReviewText = (value: string) => value.replace(/\r\n/g, "\n").trim();

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
  const tChat = useTranslations("atendimentoChatExtra");
  const { user } = useAuthStore();
  const tenantId = user?.tenantId ?? 1;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Textos que vão ao CLIENTE: no idioma da Região só quando ela define idioma; senão,
  // o texto da tela, como sempre foi.
  const { text: regionText, ensureTexts } = useRegion();

  // Rótulos padrão da escala (vão ao cliente quando a empresa não tem rótulos salvos).
  const buildDefaultRatings = useCallback((): RatingItem[] => [
    { rating: 0, label: regionText("evaluation.scale.0", undefined, t("ratingBad")), message: "" },
    { rating: 1, label: regionText("evaluation.scale.1", undefined, t("ratingRegular")), message: "" },
    { rating: 2, label: regionText("evaluation.scale.2", undefined, t("ratingGood")), message: "" },
    { rating: 3, label: regionText("evaluation.scale.3", undefined, t("ratingVeryGood")), message: "" },
    { rating: 4, label: regionText("evaluation.scale.4", undefined, t("ratingExcellent")), message: "" },
    { rating: 5, label: regionText("evaluation.scale.5", undefined, t("ratingIncredible")), message: "" },
  ], [regionText, t]);
  const DEFAULT_RATINGS = buildDefaultRatings();
  // Os padrões seguem os textos da Região que chegarem depois, até vir o salvo ou o
  // operador editar algum card.
  const defaultRatingsInUseRef = useRef(true);

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
  // Pergunta da pesquisa: só com backend que devolve a chave (antigo = campo oculto e
  // o save não manda a chave). Vazio = pergunta padrão no idioma da empresa.
  const [ratingQuestion, setRatingQuestion] = useState("");
  const [ratingQuestionSupported, setRatingQuestionSupported] = useState(false);
  // Pedido de avaliação no Google: só com backend que devolve as chaves (antigo ou banco
  // sem a coluna = card oculto e o save não manda as 3 chaves).
  const [googleReviewSupported, setGoogleReviewSupported] = useState(false);
  const [googleReviewEnabled, setGoogleReviewEnabled] = useState(false);
  const [googleReviewUrl, setGoogleReviewUrl] = useState("");
  const [googleReviewText, setGoogleReviewText] = useState("");
  const googleReviewUrlTrimmed = googleReviewUrl.trim();
  const googleReviewUrlInvalid = googleReviewUrlTrimmed !== "" && !isValidGoogleReviewUrl(googleReviewUrlTrimmed);

  // Textos da Região (voo único; normalmente já vieram no boot do painel).
  useEffect(() => {
    void ensureTexts();
  }, [ensureTexts]);

  useEffect(() => {
    if (defaultRatingsInUseRef.current) setRatings(buildDefaultRatings());
  }, [buildDefaultRatings]);

  useEffect(() => {
    fetchEvaluationConfig()
      .then(({ data }) => {
        const d = Array.isArray(data) ? data[0] : data;
        if (!d) return;
        setConfigTenantId(d.id || tenantId);
        if (Array.isArray(d.rating)) {
          defaultRatingsInUseRef.current = false;
          setRatings(d.rating);
        }
        if (Object.prototype.hasOwnProperty.call(d, "ratingQuestion")) {
          setRatingQuestionSupported(true);
          setRatingQuestion(typeof d.ratingQuestion === "string" ? d.ratingQuestion : "");
        }
        if (Object.prototype.hasOwnProperty.call(d, "ratingGoogleReview")) {
          setGoogleReviewSupported(true);
          setGoogleReviewEnabled(d.ratingGoogleReview === "enabled");
          setGoogleReviewUrl(typeof d.ratingGoogleReviewUrl === "string" ? d.ratingGoogleReviewUrl : "");
          setGoogleReviewText(typeof d.ratingGoogleReviewText === "string" ? d.ratingGoogleReviewText : "");
        }
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
    defaultRatingsInUseRef.current = false;
    setRatings((prev) => prev.map((r) => r.rating === rating ? { ...r, [field]: value } : r));
  };

  const handleSave = async () => {
    // Pedido do Google conferido ANTES de qualquer gravação: o save são 2 PUTs sem
    // atomicidade, e a recusa do backend no 2º deixaria o 1º gravado.
    const googleReviewTextNormalized = normalizeGoogleReviewText(googleReviewText);
    if (googleReviewSupported) {
      if (googleReviewUrlInvalid) { toast.error(t("googleReviewUrlInvalid")); return; }
      if (ratingMode === "native" && googleReviewEnabled && !googleReviewUrlTrimmed) {
        toast.error(t("googleReviewUrlRequired")); return;
      }
      if (googleReviewTextNormalized.length > GOOGLE_REVIEW_TEXT_MAX) {
        toast.error(t("googleReviewTextTooLong", { max: GOOGLE_REVIEW_TEXT_MAX })); return;
      }
    }
    const googleReviewToggle: "enabled" | "disabled" = googleReviewEnabled ? "enabled" : "disabled";
    const googleReviewPayload = googleReviewSupported
      ? {
          ratingGoogleReview: googleReviewToggle,
          ratingGoogleReviewUrl: googleReviewUrlTrimmed || null,
          ratingGoogleReviewText: googleReviewTextNormalized || null,
        }
      : {};
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
        // Chave só quando o backend a conhece; "" volta à pergunta padrão da Região.
        ...(ratingQuestionSupported ? { ratingQuestion: ratingQuestion.trim() } : {}),
        // Idem: as 3 chaves só quando o GET as trouxe. Texto vazio = padrão da Região.
        ...googleReviewPayload,
      });

      toast.success(t("successSaveConfig"));
    } catch (err) {
      const googleErrorKey = GOOGLE_REVIEW_ERROR_KEYS[getBackendErrorCode(err)];
      toast.error(
        googleErrorKey
          ? t(googleErrorKey, { max: GOOGLE_REVIEW_TEXT_MAX })
          : t("errorSaveConfig")
      );
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

      {googleReviewSupported && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-1.5">
              {t("googleReviewCardTitle")}
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label={t("googleReviewTooltip")} className="text-muted-foreground hover:text-foreground">
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs font-normal">
                    {t("googleReviewTooltip")}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">{t("googleReviewCardDesc")}</p>
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t("googleReviewToggleLabel")}</p>
                <p className="text-xs text-muted-foreground">{t("googleReviewToggleDesc")}</p>
              </div>
              <Switch
                checked={googleReviewEnabled}
                onCheckedChange={setGoogleReviewEnabled}
                aria-label={t("googleReviewToggleLabel")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="google-review-url">{t("googleReviewUrlLabel")}</Label>
              <Input
                id="google-review-url"
                type="url"
                inputMode="url"
                autoComplete="off"
                maxLength={GOOGLE_REVIEW_URL_MAX}
                value={googleReviewUrl}
                onChange={(e) => setGoogleReviewUrl(e.target.value)}
                placeholder={t("googleReviewUrlPlaceholder")}
                aria-invalid={googleReviewUrlInvalid}
                className={cn(googleReviewUrlInvalid && "border-destructive")}
              />
              {googleReviewUrlInvalid && (
                <p className="text-xs text-destructive">{t("googleReviewUrlInvalid")}</p>
              )}
              {googleReviewEnabled && !googleReviewUrlTrimmed && (
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400">{t("googleReviewUrlRequired")}</p>
              )}
              <p className="text-xs text-muted-foreground">{t("googleReviewUrlHint")}</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="google-review-text">{t("googleReviewTextLabel")}</Label>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {normalizeGoogleReviewText(googleReviewText).length}/{GOOGLE_REVIEW_TEXT_MAX}
                </span>
              </div>
              <Textarea
                id="google-review-text"
                rows={3}
                maxLength={GOOGLE_REVIEW_TEXT_MAX}
                value={googleReviewText}
                onChange={(e) => setGoogleReviewText(e.target.value)}
                placeholder={regionText(
                  "rating.googleReview",
                  { link: googleReviewUrlTrimmed || GOOGLE_REVIEW_LINK_VAR },
                  GOOGLE_REVIEW_DEFAULT_PT
                )}
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {t("googleReviewTextHint", { variable: GOOGLE_REVIEW_LINK_VAR, max: GOOGLE_REVIEW_TEXT_MAX })}
              </p>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{t("googleReviewPolicyNote")}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("googleReviewVariableHint", { variable: GOOGLE_REVIEW_LINK_VAR })}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("generalSettingsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {ratingQuestionSupported && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="rating-question">{t("ratingQuestionLabel")}</Label>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" aria-label={t("ratingQuestionTooltip")} className="text-muted-foreground hover:text-foreground">
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs font-normal">
                      {t("ratingQuestionTooltip")}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="rating-question"
                value={ratingQuestion}
                onChange={(e) => setRatingQuestion(e.target.value)}
                placeholder={regionText("evaluation.question", undefined, tChat("evaluationLabel"))}
              />
              <p className="text-xs text-muted-foreground">{t("ratingQuestionHint")}</p>
            </div>
          )}
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
/** Opção "Todos" do filtro por agente. */
const ALL_AGENTS = "all";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** AAAA-MM-DD no horário local (nome do arquivo quando o período não tem fim). */
function localDateStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Nome de aba do Excel: sem `\ / ? * [ ] :` e com no máximo 31 caracteres. */
function xlsxSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, "").trim().slice(0, 31) || "Sheet1";
}

/** Status HTTP da recusa: o interceptor rejeita com o próprio response (status na raiz). */
function requestStatus(err: unknown): number | undefined {
  const e = err as { status?: number; response?: { status?: number } } | null | undefined;
  return e?.status ?? e?.response?.status;
}

/** Uma coluna do export: o mesmo cabeçalho e o mesmo valor no Excel e no CSV. */
interface EvaluationExportColumn {
  header: string;
  width: number;
  /** Data: no Excel vira número de série com formato de data e hora. */
  date?: boolean;
  xlsx: (row: EvaluationExportRow) => string | number | null;
  csv: (row: EvaluationExportRow) => string;
}

function ListTab() {
  const t = useTranslations("avaliacoesPage");
  const tCommon = useTranslations("common");
  const { isLiveMode } = useLiveMode();
  const router = useRouter();
  const { country } = useRegion();
  const { hasPermission, isRestrictedUser } = useAuthStore();
  // Mesma regra da rota (requirePermission só restringe o personalizado).
  const canSeeRatings = hasPermission("ratings_view");
  // Usuário restrito e modo live não exportam (nome e número completos no arquivo).
  const canExport = canSeeRatings && !isRestrictedUser() && !isLiveMode;
  // Sem "Exportar contatos" (personalizado) o arquivo sai sem a coluna Número.
  const canSeeNumber = hasPermission("contacts_export");
  const [items, setItems] = useState<TicketEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // Busca aplicada 300 ms depois da última tecla (antes era uma requisição por tecla).
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filterRating, setFilterRating] = useState<string>("");
  const [filterUser, setFilterUser] = useState<string>(ALL_AGENTS);
  const [users, setUsers] = useState<User[]>([]);
  // Servidor antigo ignora o filtro por agente: a lista avisa em vez de fingir que filtrou.
  const [userFilterIgnored, setUserFilterIgnored] = useState(false);
  // 403 na listagem (personalizado com o menu e sem "Ver avaliações").
  const [forbidden, setForbidden] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [deleting, setDeleting] = useState<TicketEvaluation | null>(null);
  const [spyOpen, setSpyOpen] = useState(false);
  const [spyTicket, setSpyTicket] = useState<TicketForSpy | null>(null);
  const [maxScore, setMaxScore] = useState(5);
  const [exporting, setExporting] = useState(false);
  const loadSeqRef = useRef(0);
  const exportAbortRef = useRef<AbortController | null>(null);
  const exportToastRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const limit = 20;
  const searchQuery = searchTerm.trim();

  useEffect(() => {
    const handle = setTimeout(() => setSearchTerm(search), 300);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    // Escala da avaliação (Pontuação máxima). Backend antigo sem o campo (ou falha) → 5 = comportamento atual.
    fetchEvaluationConfig()
      .then(({ data }) => {
        const d = Array.isArray(data) ? data[0] : data;
        if (d && typeof d.ratingMaxScore === "number") setMaxScore(d.ratingMaxScore);
      })
      .catch(() => { /* silencioso — a listagem não depende da config */ });
  }, []);

  useEffect(() => {
    // Atendentes da empresa para o filtro (o servidor já tira o superadmin). Falhou = sem filtro.
    if (!canSeeRatings) return;
    let cancelled = false;
    fetchAllUsers()
      .then((res) => {
        if (cancelled) return;
        const label = (u: User) => u.name || u.email || "";
        setUsers([...(res.data?.users || [])].sort((a, b) => label(a).localeCompare(label(b), undefined, { sensitivity: "base" })));
      })
      .catch(() => { if (!cancelled) setUsers([]); });
    return () => { cancelled = true; };
  }, [canSeeRatings]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Trocar de aba desmonta a lista: o export em andamento para em silêncio.
      exportAbortRef.current?.abort();
      if (exportToastRef.current !== null) toast.dismiss(exportToastRef.current);
    };
  }, []);

  const userOptions = useMemo(
    () => [
      { value: ALL_AGENTS, label: t("allAgents") },
      ...users.map((u) => ({ value: String(u.id), label: u.name || u.email })),
    ],
    [users, t]
  );

  const load = useCallback(async () => {
    // Só a resposta da última chamada vale (com a busca filtrando, a de "j" pode chegar depois da de "joão").
    const seq = ++loadSeqRef.current;
    const sentUserId = filterUser !== ALL_AGENTS ? Number(filterUser) : undefined;
    setLoading(true);
    try {
      const { data } = await fetchEvaluations({
        page, limit,
        search: searchQuery || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        evaluation: filterRating && filterRating !== "all" ? Number(filterRating) : undefined,
        userId: sentUserId,
      });
      if (seq !== loadSeqRef.current) return;
      const list = data?.data ?? (Array.isArray(data) ? data : []);
      setItems(list);
      setTotalCount(data?.total ?? list.length);
      setHasMore(page < (data?.totalPages ?? 1));
      setForbidden(false);
      // Eco comparado com o agente enviado NESTA requisição (servidor antigo não devolve o eco).
      setUserFilterIgnored(sentUserId !== undefined && data?.userFilter !== sentUserId);
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      if (requestStatus(err) === 403) {
        // O aviso geral de permissão já sai pelo interceptor: aqui só a mensagem da aba.
        setForbidden(true);
        setItems([]);
        setTotalCount(0);
        setHasMore(false);
      } else {
        toast.error(t("errorLoad"));
      }
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [page, searchQuery, startDate, endDate, filterRating, filterUser]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [searchQuery, startDate, endDate, filterRating, filterUser]);

  const statusLabel = (status: EvaluationExportStatus): string => {
    if (status === "answered") return t("statusAnswered");
    if (status === "pending") return t("statusPending");
    if (status === "no_response") return t("statusNoResponse");
    return t("statusExternal");
  };

  const handleExport = async (format: "xlsx" | "csv") => {
    if (exportAbortRef.current) return;
    // App antigo, sem o recurso de salvar arquivo: avisa na hora, sem buscar nada.
    if (!canDownloadFiles()) {
      toast.warning(tCommon("downloadNeedsAppUpdate"));
      return;
    }
    const controller = new AbortController();
    exportAbortRef.current = controller;
    const toastId = `evaluations-export-${Date.now()}`;
    exportToastRef.current = toastId;
    setExporting(true);
    // Fotografia dos filtros aplicados: mexer na barra durante o export não muda o arquivo.
    const snap = {
      search: searchQuery,
      startDate,
      endDate,
      evaluation: filterRating && filterRating !== "all" ? Number(filterRating) : undefined,
      userId: filterUser !== ALL_AGENTS ? Number(filterUser) : undefined,
    };
    const withNumber = canSeeNumber;
    toast.loading(tCommon("exportLoading"), { id: toastId });
    try {
      // Escala atual para o cabeçalho "Nota (0 a N)" (a da tela pode ser de antes de uma troca).
      let scaleMax = maxScore;
      try {
        const { data: cfgData } = await fetchEvaluationConfig();
        const cfg = Array.isArray(cfgData) ? cfgData[0] : (cfgData as unknown as { ratingMaxScore?: unknown });
        if (cfg && typeof cfg.ratingMaxScore === "number") scaleMax = cfg.ratingMaxScore;
      } catch { /* fica a escala da tela */ }
      if (controller.signal.aborted) return;

      const collected: TicketEvaluation[] = [];
      const seen = new Set<number>();
      let fetched = 0;
      let capped = false;
      let searchPartial = false;
      let isNew = true;
      for (let p = 1; p <= EXPORT_MAX_PAGES; p++) {
        const { data } = await fetchEvaluations(
          {
            page: p,
            limit: EXPORT_PAGE_SIZE,
            search: snap.search || undefined,
            startDate: snap.startDate || undefined,
            endDate: snap.endDate || undefined,
            evaluation: snap.evaluation,
            userId: snap.userId,
          },
          { signal: controller.signal }
        );
        if (controller.signal.aborted) return;
        if (p === 1) {
          isNew = isNewEvaluationsBackend(data);
          // Servidor antigo (ou eco diferente) ignoraria o agente e exportaria todos.
          if (snap.userId !== undefined && (!isNew || data?.userFilter !== snap.userId)) {
            toast.error(t("exportUserFilterUnsupported"), { id: toastId });
            return;
          }
        }
        const pageItems: TicketEvaluation[] = Array.isArray(data?.data) ? data.data : [];
        fetched += pageItems.length;
        for (const ev of pageItems) {
          // Avaliação nova durante o laço empurra linhas para a página seguinte.
          if (seen.has(ev.id)) continue;
          seen.add(ev.id);
          // Servidor antigo não filtra pela busca: as que não casam vêm sem contato.
          if (snap.search && !isNew && !ev.ticket?.contact) {
            searchPartial = true;
            continue;
          }
          collected.push(ev);
        }
        const total = Math.min(Number(data?.total) || 0, EXPORT_MAX_ROWS);
        toast.loading(t("exportProgress", { count: fetched, total: Math.max(total, fetched) }), { id: toastId });
        const totalPages = Number(data?.totalPages);
        // Página curta pelo limit que o servidor aplicou (ele corta acima do teto dele).
        const servedLimit = Number(data?.limit) > 0 ? Number(data?.limit) : EXPORT_PAGE_SIZE;
        const lastPage =
          pageItems.length < servedLimit || (Number.isFinite(totalPages) && p >= totalPages);
        if (lastPage) break;
        if (p === EXPORT_MAX_PAGES) {
          // Servidor antigo com busca varre a empresa inteira: o teto não diz quantas
          // casariam, então o aviso certo é o de busca incompleta.
          if (snap.search && !isNew) searchPartial = true;
          else capped = true;
        }
      }

      if (collected.length === 0) {
        toast.info(t("exportEmpty"), { id: toastId });
        if (searchPartial) toast.warning(t("exportSearchPartial"));
        return;
      }

      const rows = buildEvaluationExportRows(collected, { canSeeNumber: withNumber });
      const locale = getActiveLocale();
      const csvDate = (d: Date | null) => csvCell(d ? csvDateTimeText(d, locale) : "");
      const columns: EvaluationExportColumn[] = [
        { header: t("colTicket"), width: 10, xlsx: (r) => r.ticketId || null, csv: (r) => csvCell(r.ticketId || "") },
        { header: t("colProtocol"), width: 22, xlsx: (r) => r.protocol || null, csv: (r) => csvDigitsCell(r.protocol) },
        { header: t("colContact"), width: 28, xlsx: (r) => r.contactName || null, csv: (r) => csvCell(r.contactName) },
        ...(withNumber
          ? [{
              header: t("colNumber"),
              width: 20,
              xlsx: (r: EvaluationExportRow) => r.contactIdentity || null,
              csv: (r: EvaluationExportRow) => csvDigitsCell(r.contactIdentity),
            }]
          : []),
        { header: t("colAgent"), width: 22, xlsx: (r) => r.agent || null, csv: (r) => csvCell(r.agent) },
        { header: t("colRatingScale", { max: scaleMax }), width: 12, xlsx: (r) => r.score, csv: (r) => csvCell(r.score ?? "") },
        { header: t("colStatus"), width: 20, xlsx: (r) => statusLabel(r.status), csv: (r) => csvCell(statusLabel(r.status)) },
        { header: t("colExternalLink"), width: 40, xlsx: (r) => r.externalUrl || null, csv: (r) => csvCell(r.externalUrl) },
        {
          header: t("colSentAt"),
          width: 18,
          date: true,
          xlsx: (r) => (r.sentAt ? excelSerialFromLocalDate(r.sentAt) : null),
          csv: (r) => csvDate(r.sentAt),
        },
        {
          header: t("colAnsweredAt"),
          width: 18,
          date: true,
          xlsx: (r) => (r.answeredAt ? excelSerialFromLocalDate(r.answeredAt) : null),
          csv: (r) => csvDate(r.answeredAt),
        },
        { header: t("colQueue"), width: 20, xlsx: (r) => r.queue || null, csv: (r) => csvCell(r.queue) },
        { header: t("colChannel"), width: 20, xlsx: (r) => r.channel || null, csv: (r) => csvCell(r.channel) },
      ];

      let blob: Blob;
      if (format === "xlsx") {
        const mod = await import("xlsx");
        const XLSX = mod.default ?? mod;
        if (controller.signal.aborted) return;
        const aoa: (string | number | null)[][] = [
          columns.map((c) => c.header),
          ...rows.map((r) => columns.map((c) => c.xlsx(r))),
        ];
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        // Datas de verdade: número de série calculado aqui + formato de data e hora do
        // idioma da tela (nunca `Date` na SheetJS, que erra a hora).
        const dateFormat = excelDateTimeFormat(locale);
        columns.forEach((c, colIndex) => {
          if (!c.date) return;
          rows.forEach((_, rowIndex) => {
            const cell = ws[XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex })];
            if (cell && typeof cell.v === "number") {
              cell.t = "n";
              cell.z = dateFormat;
            }
          });
        });
        ws["!cols"] = columns.map((c) => ({ wch: c.width }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, xlsxSheetName(t("exportSheetName")));
        const out = XLSX.write(wb, { bookType: "xlsx", type: "array", compression: true });
        blob = new Blob([out], { type: XLSX_MIME });
      } else {
        const csvRows: string[][] = [
          columns.map((c) => csvCell(c.header)),
          ...rows.map((r) => columns.map((c) => c.csv(r))),
        ];
        blob = new Blob([buildCsv(csvRows, csvDelimiterForCountry(country))], { type: "text/csv;charset=utf-8" });
      }
      if (controller.signal.aborted) return;

      const today = localDateStamp(new Date());
      let range: string;
      if (snap.startDate && snap.endDate) range = t("exportFileRange", { start: snap.startDate, end: snap.endDate });
      else if (snap.startDate) range = t("exportFileRange", { start: snap.startDate, end: today });
      else if (snap.endDate) range = snap.endDate;
      else range = today;
      const fileName = `${sanitizeFileNamePart(t("exportFileName"))}_${sanitizeFileNamePart(range)}.${format}`;

      const result = await downloadFile(blob, fileName);
      if (result === "app_outdated") {
        toast.dismiss(toastId);
        toast.warning(tCommon("downloadNeedsAppUpdate"));
        return;
      }
      toast.success(t("exportSuccess", { count: rows.length }), { id: toastId });
      if (capped) toast.warning(t("exportCapped", { cap: EXPORT_MAX_ROWS }));
      if (searchPartial) toast.warning(t("exportSearchPartial"));
    } catch (err) {
      if (controller.signal.aborted) {
        toast.dismiss(toastId);
        return;
      }
      if (requestStatus(err) === 403) {
        // O interceptor já avisou a falta de permissão.
        toast.dismiss(toastId);
        return;
      }
      toast.error(t("exportError"), { id: toastId });
    } finally {
      if (controller.signal.aborted) toast.dismiss(toastId);
      if (exportAbortRef.current === controller) exportAbortRef.current = null;
      if (exportToastRef.current === toastId) exportToastRef.current = null;
      if (mountedRef.current) setExporting(false);
    }
  };

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
  const tableMax = Math.max(
    maxScore,
    ...items.map((ev) => (evaluationStatus(ev) === "answered" ? numericScore(ev.evaluation) ?? 0 : 0))
  );

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
        {users.length > 0 && (
          <div className="w-full space-y-1 sm:w-auto">
            <Label className="text-xs">{t("colAgent")}</Label>
            <SearchableSelect
              options={userOptions}
              value={filterUser}
              onValueChange={(v) => setFilterUser(v || ALL_AGENTS)}
              placeholder={t("allAgents")}
              triggerClassName="w-full sm:w-48"
            />
          </div>
        )}
        <Button variant="outline" size="icon" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
        {canExport && (
          <DropdownMenu>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="px-3 sm:px-4"
                      disabled={exporting}
                      aria-label={t("exportButton")}
                    >
                      {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      <span className="hidden sm:inline">{t("exportButton")}</span>
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs font-normal">
                  {t("exportTooltip", { cap: EXPORT_MAX_ROWS })}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-2rem)]">
              {/* No toque o tooltip não aparece: a explicação curta fica dentro do menu. */}
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {t("exportMenuHint", { cap: EXPORT_MAX_ROWS })}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => { void handleExport("xlsx"); }}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                {t("exportExcel")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { void handleExport("csv"); }}>
                <FileText className="mr-2 h-4 w-4" />
                {t("exportCsv")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {userFilterIgnored && !loading && (
        <Alert variant="warning-soft">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{t("userFilterUnsupported")}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : forbidden ? (
        <EmptyState icon={Lock} title={t("noPermissionTitle")} description={t("noPermissionDescription")} />
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
                        ) : evaluationStatus(ev) === "answered" ? (
                          <StarRating rating={numericScore(ev.evaluation) ?? 0} max={tableMax} />
                        ) : (
                          // Pesquisa ainda sem nota: a situação no lugar de estrelas vazias (que pareciam nota 0).
                          <span className="text-xs text-muted-foreground">
                            {evaluationStatus(ev) === "pending" ? t("statusPending") : t("statusNoResponse")}
                          </span>
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
  // Gate isolado num wrapper: o conteúdo tem hooks, e sair com `return` antes deles
  // quebraria o React quando a permissão muda com a página montada.
  const allowed = usePageAccess("avaliacoes", { adminSuperOnly: true });
  if (!allowed) return <AccessDenied />;
  return <AvaliacoesPageContent />;
}

function AvaliacoesPageContent() {
  const t = useTranslations("avaliacoesPage");
  const searchParams = useSearchParams();
  const wantsGoogleTab = searchParams?.get("tab") === "google";
  const [tab, setTab] = useState("listar");
  // Aba Google só quando o backend tem o recurso (rotas novas, plano com
  // Avaliações/NPS e recurso ligado). Qualquer outra resposta = sem aba.
  const [googleTabAvailable, setGoogleTabAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleBusinessStatus({ background: true })
      .then((res) => {
        if (!cancelled) setGoogleTabAvailable(res.state === "ok");
      })
      .catch(() => { /* sem aba */ });
    return () => { cancelled = true; };
  }, []);

  // `?tab=google` (link do sino e do push) abre a aba assim que ela existir.
  useEffect(() => {
    if (googleTabAvailable && wantsGoogleTab) setTab("google");
  }, [googleTabAvailable, wantsGoogleTab]);

  const pageHelp = {
    description: t("helpDesc"),
    sections: [
      { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
      { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
      { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
      { title: t("helpS3T"), items: [t("helpS3I0"), t("helpS3I1"), t("helpS3I2")] },
    ],
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={pageHelp}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="max-w-full justify-start overflow-x-auto overflow-y-hidden">
          <TabsTrigger value="listar"><Star className="mr-2 h-4 w-4" />{t("tabList")}</TabsTrigger>
          <TabsTrigger value="relatorio"><BarChart3 className="mr-2 h-4 w-4" />{t("tabNps")}</TabsTrigger>
          <TabsTrigger value="configurar"><Settings className="mr-2 h-4 w-4" />{t("tabConfig")}</TabsTrigger>
          {googleTabAvailable && (
            <TabsTrigger value="google"><Store className="mr-2 h-4 w-4" />{t("tabGoogle")}</TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="listar" className="mt-4 pb-8"><ListTab /></TabsContent>
        <TabsContent value="relatorio" className="mt-4 pb-8"><NpsReportTab /></TabsContent>
        <TabsContent value="configurar" className="mt-4 pb-8"><ConfigTab /></TabsContent>
        {googleTabAvailable && (
          <TabsContent value="google" className="mt-4 pb-8"><GoogleReviewsTab /></TabsContent>
        )}
      </Tabs>
    </div>
  );
}
