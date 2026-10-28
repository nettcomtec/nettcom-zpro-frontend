"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  RefreshCw,
  Zap,
  ExternalLink,
  Activity,
  BadgeCheck,
  Ban,
  BellRing,
  ClipboardCheck,
  Gauge,
  Handshake,
  HelpCircle,
  Info,
  KeyRound,
  Megaphone,
  OctagonAlert,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  diagnoseMetaChannel,
  revalidateMetaWebhook,
  DiagnoseResult,
  MetaAccountEvent,
  MetaAccountEventDetailValue,
  MetaAccountEventKind,
  ProbeResult,
  ProbeStatus,
} from "@/services/meta-channel-health";
import { WHATSAPP_MANAGER_URL } from "@/lib/meta-send-health";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface DiagnoseModalProps {
  whatsappId: number | null;
  channelName?: string;
  channelType?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReconnect?: () => void;
  onRevalidated?: (needsRevalidation: boolean) => void;
  /** Quando true, usa os endpoints cross-tenant /whatsappTenants/actions/* (página /sessoestenants, superadmin). */
  crossTenant?: boolean;
}

const STATUS_BADGE_CLASS: Record<ProbeStatus, string> = {
  ok: "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700",
  warn: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700",
  error: "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700",
};

function ProbeIcon({ status }: { status: ProbeStatus }) {
  if (status === "ok") return <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />;
  if (status === "warn") return <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />;
  return <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />;
}

/**
 * Termos da Marketing Messages API (WABA, só com `?mmStatus=1`): o `detail` é o valor cru
 * da Meta e vira texto pelo valor (ONBOARDED → aceitos; ELIGIBLE → pode aceitar; outro →
 * texto genérico). Item só informativo: nunca acende "Reconectar".
 */
function marketingMessagesDetail(detail: string | null, t: ReturnType<typeof useTranslations>): string | null {
  const raw = typeof detail === "string" ? detail.trim() : "";
  if (!raw) return null;
  const upper = raw.toUpperCase();
  const key = upper === "ONBOARDED" ? "onboarded" : upper === "ELIGIBLE" ? "eligible" : "other";
  try {
    return t(`probes.MM_ONBOARDING.${key}` as Parameters<typeof t>[0], { status: raw });
  } catch {
    return raw;
  }
}

function ProbeRow({ probe, t }: { probe: ProbeResult; t: ReturnType<typeof useTranslations> }) {
  const labelKey = `probes.${probe.id}.label` as Parameters<typeof t>[0];
  let label: string;
  try {
    label = t(labelKey);
  } catch {
    label = probe.id;
  }

  const isMarketingMessages = probe.id === "MM_ONBOARDING";
  const mmOnboarded = isMarketingMessages && String(probe.detail ?? "").trim().toUpperCase() === "ONBOARDED";
  const detailText = isMarketingMessages
    ? marketingMessagesDetail(probe.detail, t)
    : probe.detail
      ? probe.detail.replace(/zdg_oauth/gi, "tech_provider_oauth")
      : null;

  return (
    <div className="flex items-start gap-3 py-2">
      {/* Termos ainda não aceitos não é falha do canal: ícone informativo, nunca o "x"/alerta. */}
      {isMarketingMessages && !mmOnboarded ? (
        <Info className="w-5 h-5 text-sky-500 flex-shrink-0" aria-hidden="true" />
      ) : (
        <ProbeIcon status={probe.status} />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight">{label}</p>
        {detailText && (
          <p className="text-xs text-muted-foreground mt-0.5 break-words">{detailText}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Avisos da conta (Meta) — docs/PLANO_WABA_AVISOS_CONTA_ROTEAMENTO.md (D7/R11, §10).
// Só informativos: a lista nunca muda o canal. Título pelo `kind`, resumo pelo `code`
// (`accountEvents.codes.<kind>.<code>`) e, sem tradução, a reserva `rawFallback` com o
// texto da Meta (ou o próprio código). Chave ausente nunca vai crua para a tela.
// ---------------------------------------------------------------------------

const ACCOUNT_EVENT_STYLE: Record<MetaAccountEventKind, { Icon: LucideIcon; className: string }> = {
  ban: { Icon: Ban, className: "text-red-500" },
  restriction: { Icon: ShieldAlert, className: "text-amber-500" },
  violation: { Icon: OctagonAlert, className: "text-red-500" },
  review: { Icon: ClipboardCheck, className: "text-muted-foreground" },
  alert: { Icon: BellRing, className: "text-amber-500" },
  name: { Icon: BadgeCheck, className: "text-muted-foreground" },
  capability: { Icon: Gauge, className: "text-muted-foreground" },
  security: { Icon: KeyRound, className: "text-muted-foreground" },
  partner: { Icon: Handshake, className: "text-muted-foreground" },
  quality: { Icon: Activity, className: "text-muted-foreground" },
  other: { Icon: Info, className: "text-muted-foreground" },
};

function isAccountEventKind(value: unknown): value is MetaAccountEventKind {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ACCOUNT_EVENT_STYLE, value);
}

// Pedaço de chave i18n vindo do servidor: só letras, dígitos e "_" (ponto viraria outro
// caminho do dicionário).
const SAFE_I18N_SEGMENT = /^[A-Za-z0-9_]{1,64}$/;
// Valor de detalhe com cara de código da Meta (tenta a tradução do código).
const CODE_LIKE_VALUE = /^[A-Z][A-Z0-9_]{0,63}$/;
const DATE_ONLY_VALUE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_VALUE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
// Campo numérico que é horário em segundos/milissegundos (prazo de restrição etc.).
const DATE_LIKE_DETAIL_KEY = /(date|time|expir|until|deadline)/i;
const MAX_ACCOUNT_EVENT_DETAILS = 6;
const DATE_TIME_SHORT: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" };

type SafeTranslate = (key: string, values?: Record<string, string>) => string | null;

/**
 * Tradução que devolve null quando a chave não existe no idioma da tela. O next-intl, com
 * chave ausente, devolve o próprio caminho ("metaChannelHealth.<chave>") e loga erro; por
 * isso confere antes com `t.has` e, como 2ª trava (chave que aponta para um grupo, ou
 * formatação que falhou), compara o retorno com o caminho.
 */
function useSafeTranslate(): SafeTranslate {
  const t = useTranslations("metaChannelHealth");
  return (key, values) => {
    try {
      if (!t.has(key)) return null;
      const out = t(key, values);
      if (typeof out !== "string" || !out.trim() || out === `metaChannelHealth.${key}`) return null;
      return out;
    } catch {
      return null;
    }
  };
}

function parseEventDate(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDetailValue(
  key: string,
  value: MetaAccountEventDetailValue | undefined,
  kind: MetaAccountEventKind,
  tx: SafeTranslate,
  values: Record<string, string>
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") {
    return tx(value ? "accountEvents.yes" : "accountEvents.no") ?? String(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    if (DATE_LIKE_DETAIL_KEY.test(key) && value >= 1e9 && value < 1e13) {
      return formatDateTime(new Date(value < 1e11 ? value * 1000 : value), DATE_TIME_SHORT);
    }
    return formatNumber(value);
  }
  // Fora do contrato (objeto/lista): nunca vira JSON na tela.
  if (typeof value !== "string") return null;
  const text = value.trim().slice(0, 120);
  if (!text) return null;
  if (CODE_LIKE_VALUE.test(text)) {
    const translated = tx(`accountEvents.codes.${kind}.${text}`, values);
    if (translated) return translated;
  }
  const dateOnly = DATE_ONLY_VALUE.exec(text);
  if (dateOnly) {
    // Dia civil: monta no fuso local (new Date("AAAA-MM-DD") seria meia-noite UTC = véspera no Brasil).
    const d = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    if (!Number.isNaN(d.getTime())) return formatDate(d, { dateStyle: "short" });
  }
  if (DATE_TIME_VALUE.test(text)) {
    const d = new Date(text);
    if (!Number.isNaN(d.getTime())) return formatDateTime(d, DATE_TIME_SHORT);
  }
  return text;
}

interface AccountEventLine {
  key: string;
  label: string;
  value: string;
  ltr?: boolean;
}

function AccountEventRow({ event, tx }: { event: MetaAccountEvent; tx: SafeTranslate }) {
  const summary = event.summary && typeof event.summary === "object" ? event.summary : null;
  const rawKind = summary?.kind;
  const kind: MetaAccountEventKind = isAccountEventKind(rawKind) ? rawKind : "other";
  const { Icon, className } = ACCOUNT_EVENT_STYLE[kind];

  const title = tx(`accountEvents.kinds.${kind}`) ?? tx("accountEvents.kinds.other") ?? kind;

  const code = typeof summary?.code === "string" ? summary.code.trim() : "";
  const text = typeof summary?.text === "string" ? summary.text.trim() : "";
  const rawPhone = summary?.phone;
  const phoneDigits =
    typeof rawPhone === "string" || typeof rawPhone === "number" ? String(rawPhone).replace(/\D/g, "") : "";
  const phone = phoneDigits ? `+${phoneDigits}` : "";
  // Disponíveis para o texto traduzido de um código, se ele quiser usá-los.
  const values: Record<string, string> = { text, code, phone };

  const translatedSummary =
    code && SAFE_I18N_SEGMENT.test(code) ? tx(`accountEvents.codes.${kind}.${code}`, values) : null;
  const rawSummary = text || code;
  const summaryLine =
    translatedSummary ?? (rawSummary ? tx("accountEvents.rawFallback", { text: rawSummary }) ?? rawSummary : null);

  const when = parseEventDate(event.metaTime) ?? parseEventDate(event.createdAt);

  const lines: AccountEventLine[] = [];
  if (phone) {
    const phoneLabel = tx("accountEvents.phone");
    if (phoneLabel) lines.push({ key: "__phone", label: phoneLabel, value: phone, ltr: true });
  }
  const details = summary?.details;
  if (details && typeof details === "object" && !Array.isArray(details)) {
    for (const [key, rawValue] of Object.entries(details)) {
      if (lines.length >= MAX_ACCOUNT_EVENT_DETAILS) break;
      if (!SAFE_I18N_SEGMENT.test(key)) continue;
      // Sem rótulo traduzido o campo fica fora: nunca o nome técnico da Meta na tela.
      const label = tx(`accountEvents.details.${key}`);
      if (!label) continue;
      const value = formatDetailValue(key, rawValue, kind, tx, values);
      if (!value) continue;
      lines.push({ key, label, value });
    }
  }

  return (
    <li className="flex items-start gap-3 py-2">
      <Icon className={cn("w-5 h-5 flex-shrink-0 mt-0.5", className)} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <p className="min-w-0 text-sm font-medium leading-tight [overflow-wrap:anywhere]">{title}</p>
          {when && (
            <time dateTime={when.toISOString()} className="shrink-0 text-[11px] text-muted-foreground">
              {formatDateTime(when, DATE_TIME_SHORT)}
            </time>
          )}
        </div>
        {summaryLine && (
          <p className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">{summaryLine}</p>
        )}
        {lines.length > 0 && (
          <dl className="mt-1 space-y-0.5">
            {lines.map((line) => (
              <div key={line.key} className="flex flex-wrap gap-x-1 text-xs">
                <dt className="text-muted-foreground [overflow-wrap:anywhere]">{line.label}:</dt>
                <dd className="min-w-0 [overflow-wrap:anywhere]" dir={line.ltr ? "ltr" : undefined}>
                  {line.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </li>
  );
}

function AccountEventsSection({ events }: { events: MetaAccountEvent[] }) {
  const t = useTranslations("metaChannelHealth");
  const tx = useSafeTranslate();
  const list = events.filter((ev): ev is MetaAccountEvent => !!ev && typeof ev === "object");

  return (
    <section className="space-y-1 pt-1">
      <div className="flex items-center gap-1.5 pt-1">
        <Megaphone className="w-4 h-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
        <h3 className="min-w-0 text-sm font-semibold [overflow-wrap:anywhere]">{t("accountEvents.title")}</h3>
        {/* Popover (e não Tooltip): abre no toque do celular. */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t("accountEvents.helpLabel")}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-80 max-w-[calc(100vw-2rem)] whitespace-pre-line p-3 text-xs leading-relaxed text-muted-foreground"
          >
            {t("accountEvents.tooltip")}
          </PopoverContent>
        </Popover>
      </div>
      {list.length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">{t("accountEvents.empty")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {list.map((ev, idx) => (
            <AccountEventRow key={`${String(ev.id ?? "")}-${idx}`} event={ev} tx={tx} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function DiagnoseModal({
  whatsappId,
  channelName,
  channelType,
  open,
  onOpenChange,
  onReconnect,
  onRevalidated,
  crossTenant = false,
}: DiagnoseModalProps) {
  const t = useTranslations("metaChannelHealth");
  const [loading, setLoading] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [result, setResult] = useState<DiagnoseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runDiagnose() {
    if (!whatsappId) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await diagnoseMetaChannel(whatsappId, crossTenant);
      setResult(data);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "unknown";
      setError(msg);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && whatsappId) {
      void runDiagnose();
    }
    if (!open) {
      setResult(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, whatsappId]);

  // O probe PHONE_NUMBER (health_status do número) não se resolve reconectando nem
  // revalidando o webhook: pagamento/bloqueio da conta é no WhatsApp Manager. Por isso
  // "Reconectar"/"Revalidar" só acendem com outro probe fora de "ok"; resultado sem
  // probes mantém a regra antiga (geral ≠ ok). MM_ONBOARDING (termos da Marketing
  // Messages API) é só informativo e também fica fora da conta.
  const resultProbes: ProbeResult[] = result && Array.isArray(result.probes) ? result.probes : [];
  const channelNeedsAction = !!result && (
    resultProbes.length > 0
      ? resultProbes.some((p) => p.id !== "PHONE_NUMBER" && p.id !== "MM_ONBOARDING" && p.status !== "ok")
      : result.overallStatus !== "ok"
  );
  const showReconnect = channelNeedsAction;
  const revalidatableChannel = channelType === "instagram" || channelType === "messenger";
  const showRevalidate = revalidatableChannel && channelNeedsAction;
  const showOpenManager = resultProbes.some((p) => p.id === "PHONE_NUMBER" && p.status === "error");

  async function runRevalidate() {
    if (!whatsappId) return;
    setRevalidating(true);
    try {
      const { data } = await revalidateMetaWebhook(whatsappId, crossTenant);
      if (data?.needsRevalidation) {
        toast.warning(t("revalidate.partial"));
      } else {
        toast.success(t("revalidate.success"));
      }
      onRevalidated?.(!!data?.needsRevalidation);
      await runDiagnose();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "unknown";
      toast.error(t("revalidate.error", { detail: msg }));
    } finally {
      setRevalidating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-full max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="break-words">
            {channelName ? channelName : ""}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="space-y-3 py-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="w-5 h-5 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground text-center pt-2">{t("running")}</p>
          </div>
        )}

        {!loading && error && (
          <div className="py-4">
            <div className="flex items-start gap-2 text-sm">
              <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-muted-foreground break-words">{error}</p>
            </div>
          </div>
        )}

        {!loading && result && (
          <>
            <div className="flex items-center justify-between gap-2 py-2">
              <span className="text-xs text-muted-foreground">
                {new Date(result.checkedAt).toLocaleString()}
              </span>
              <Badge variant="outline" className={STATUS_BADGE_CLASS[result.overallStatus]}>
                {t(`overallStatus.${result.overallStatus}`)}
              </Badge>
            </div>
            <Separator />
            <div className="divide-y divide-border">
              {result.probes.map((probe, idx) => (
                <ProbeRow key={`${probe.id}-${idx}`} probe={probe} t={t} />
              ))}
            </div>
            {/* Backend antigo (ou tabela sem a migration) não manda o campo: a seção some. */}
            {Array.isArray(result.accountEvents) && (
              <>
                <Separator />
                <AccountEventsSection events={result.accountEvents} />
              </>
            )}
          </>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
          {!loading && (
            <Button
              variant="outline"
              size="sm"
              onClick={runDiagnose}
              disabled={!whatsappId}
              className="w-full sm:w-auto"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {t("retest")}
            </Button>
          )}
          {loading && (
            <Button variant="outline" size="sm" disabled className="w-full sm:w-auto">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t("running")}
            </Button>
          )}
          {!loading && showRevalidate && (
            <Button
              variant="secondary"
              size="sm"
              onClick={runRevalidate}
              disabled={revalidating}
              className="w-full sm:w-auto"
            >
              {revalidating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Zap className="w-4 h-4 mr-2" />
              )}
              {revalidating ? t("revalidate.running") : t("revalidate.action")}
            </Button>
          )}
          {!loading && showOpenManager && (
            <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
              <a href={WHATSAPP_MANAGER_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-2" />
                {t("openManager")}
              </a>
            </Button>
          )}
          {!loading && showReconnect && onReconnect && (
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                onReconnect();
                onOpenChange(false);
              }}
              className="w-full sm:w-auto"
            >
              {t("reconnect")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
