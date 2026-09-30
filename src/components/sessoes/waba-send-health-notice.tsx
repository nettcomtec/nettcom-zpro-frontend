"use client";

// Aviso por canal do alerta de envio WABA (docs/PLANO_ALERTA_PAGAMENTO_WABA.md, F4):
// linha compacta no card de /sessoes ("card") e bloco na "Info Conexão" das
// Integrações Meta ("panel"). Lê o cache compartilhado de lib/meta-send-health
// (um GET por janela de 60 s para todos os consumidores); canal sem alerta não
// renderiza nada. Os textos da Meta chegam em inglês e são mostrados como vieram.

import { useState, type MouseEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  HelpCircle,
  Info,
  Loader2,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import {
  META_PAYMENT_HELP_URL,
  WHATSAPP_MANAGER_URL,
  findSendHealthByWhatsappId,
  refreshMetaSendHealth,
  useCanResolveMetaSendHealth,
  useMetaSendHealth,
} from "@/lib/meta-send-health";
import {
  markMetaPaymentResolved,
  type MetaSendHealthDetail,
  type MetaSendHealthKind,
} from "@/services/meta-send-health";

type Props = {
  whatsappId: number | string | null | undefined;
  variant: "card" | "panel";
  className?: string;
};

const KNOWN_ENTITIES = new Set(["PHONE_NUMBER", "WABA", "BUSINESS"]);

/** No tooltip do card cabem poucas entidades; o painel mostra todas. */
const CARD_TOOLTIP_MAX_DETAILS = 3;

const TONES: Record<MetaSendHealthKind, { Icon: LucideIcon; line: string; icon: string; panel: string }> = {
  payment: {
    Icon: CreditCard,
    line: "text-destructive",
    icon: "",
    panel: "border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300",
  },
  blocked: {
    Icon: ShieldAlert,
    line: "text-amber-600 dark:text-amber-400",
    icon: "",
    panel: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300",
  },
  limited: {
    Icon: Info,
    line: "text-muted-foreground",
    icon: "text-yellow-500 dark:text-yellow-400",
    panel: "border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-900/40 dark:bg-yellow-950/20 dark:text-yellow-200",
  },
};

function cleanDetails(raw: unknown): MetaSendHealthDetail[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((d): d is MetaSendHealthDetail => !!d && typeof d === "object");
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function infoLines(detail: MetaSendHealthDetail): string[] {
  if (!Array.isArray(detail.info)) return [];
  return detail.info.map(textOf).filter(Boolean);
}

function formatWhen(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return formatDateTime(date, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return date.toLocaleString();
  }
}

export function WabaSendHealthNotice({ whatsappId, variant, className }: Props) {
  const t = useTranslations("metaSendHealth");
  const rows = useMetaSendHealth(true);
  const canResolve = useCanResolveMetaSendHealth();
  const [resolving, setResolving] = useState(false);

  const row = findSendHealthByWhatsappId(rows, whatsappId);
  if (!row) return null;
  const kind = row.kind;
  const tone = TONES[kind];
  // Tipo que este front não conhece (backend mais novo): não mostra nada.
  if (!tone) return null;
  const { Icon } = tone;

  const title =
    kind === "payment" ? t("cardPayment") : kind === "blocked" ? t("cardBlocked") : t("cardLimited");
  const details = cleanDetails(row.healthDetails);
  const lastFailure = kind === "payment" ? formatWhen(row.paymentIssueLastAt ?? row.paymentIssueAt) : null;
  const showResolve = kind === "payment" && canResolve;
  // Bloqueio sem o texto da Meta (quem não resolve recebe a forma mínima): explica o efeito.
  const genericBlockedHint = kind === "blocked" && details.length === 0 ? t("badgeTooltip") : null;

  const entityLabel = (entity: unknown): string => {
    const raw = textOf(entity);
    if (!raw) return "";
    return KNOWN_ENTITIES.has(raw) ? t(`entity.${raw}`) : raw;
  };

  const renderDetail = (detail: MetaSendHealthDetail, index: number) => {
    const label = entityLabel(detail.entity);
    const code = detail.code !== null && detail.code !== undefined && String(detail.code).trim() !== ""
      ? `(${String(detail.code).trim()})`
      : "";
    const summary = [textOf(detail.description), code].filter(Boolean).join(" ");
    const solution = textOf(detail.solution);
    const info = infoLines(detail);
    return (
      <li key={`${label}-${index}`} className="break-words">
        <p>
          {label && (
            <span className="font-medium">
              {label}
              {summary ? ": " : ""}
            </span>
          )}
          {summary}
        </p>
        {solution && <p className="opacity-90">{solution}</p>}
        {info.map((line, i) => (
          <p key={i} className="opacity-90">
            {line}
          </p>
        ))}
      </li>
    );
  };

  async function handleResolved(e?: MouseEvent) {
    e?.stopPropagation();
    if (resolving || !row) return;
    setResolving(true);
    try {
      const { data } = await markMetaPaymentResolved(Number(row.whatsappId));
      await refreshMetaSendHealth(true);
      // D10: a Meta ainda acusa falha de pagamento — o aviso fica e o usuário é avisado.
      if (data && typeof data === "object" && data.stillPaymentIssue === true) {
        toast.warning(t("stillFailingToast"));
      } else {
        toast.success(t("resolvedToast"));
      }
    } catch (err: unknown) {
      const failure = err as { status?: number; response?: { status?: number } } | null;
      const status = failure?.status ?? failure?.response?.status;
      // 403 já tem toast global (ERR_NO_PERMISSION no interceptor da api).
      if (status !== 403) toast.error(t("resolvedError"));
    } finally {
      setResolving(false);
    }
  }

  if (variant === "card") {
    const tooltipParts: ReactNode[] = [];
    if (kind === "payment") tooltipParts.push(<p key="hint">{t("cardPaymentHint")}</p>);
    if (lastFailure) {
      tooltipParts.push(
        <p key="last" className="opacity-80">
          {t("lastFailure", { when: lastFailure })}
        </p>
      );
    }
    if (details.length > 0) {
      tooltipParts.push(
        <div key="meta" className="space-y-1">
          <p className="font-medium">{t("metaSays")}</p>
          <ul className="space-y-1">{details.slice(0, CARD_TOOLTIP_MAX_DETAILS).map(renderDetail)}</ul>
        </div>
      );
    }
    if (genericBlockedHint) tooltipParts.push(<p key="generic">{genericBlockedHint}</p>);
    const hasTooltip = tooltipParts.length > 0;

    const trigger = (
      <span
        className={cn("inline-flex items-center gap-1 font-medium", tone.line, hasTooltip && "cursor-help")}
        tabIndex={hasTooltip ? 0 : undefined}
      >
        <Icon className={cn("w-3.5 h-3.5 shrink-0", tone.icon)} />
        <span>{title}</span>
        {hasTooltip && <HelpCircle className="w-3 h-3 shrink-0 opacity-70" />}
      </span>
    );

    const linkCls = cn(
      "inline-flex items-center gap-0.5 underline underline-offset-2 hover:opacity-80",
      tone.line
    );

    return (
      <div className={cn("mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs", className)}>
        {hasTooltip ? (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>{trigger}</TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-xs space-y-1">
                {tooltipParts}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          trigger
        )}
        {kind === "payment" && (
          <a href={WHATSAPP_MANAGER_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>
            {t("addPaymentCta")}
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
        )}
        {kind === "blocked" && (
          <a href={WHATSAPP_MANAGER_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>
            {t("openManagerCta")}
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
        )}
        {showResolve && (
          <button
            type="button"
            onClick={handleResolved}
            disabled={resolving}
            className="inline-flex items-center gap-1 underline underline-offset-2 text-muted-foreground hover:text-foreground cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
          >
            {resolving && <Loader2 className="w-3 h-3 animate-spin" />}
            {t("resolvedCta")}
          </button>
        )}
      </div>
    );
  }

  const buttonCls = "h-7 px-2.5 text-xs [&_svg]:size-3.5";

  return (
    <div role="status" className={cn("rounded-md border p-3 text-sm flex items-start gap-2", tone.panel, className)}>
      <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", tone.icon)} />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="space-y-0.5">
          <p className="font-semibold leading-tight">{title}</p>
          {kind === "payment" && <p className="text-xs opacity-90">{t("cardPaymentHint")}</p>}
          {genericBlockedHint && <p className="text-xs opacity-90">{genericBlockedHint}</p>}
          {lastFailure && <p className="text-xs opacity-75">{t("lastFailure", { when: lastFailure })}</p>}
        </div>
        {details.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium opacity-80">{t("metaSays")}</p>
            <ul className="space-y-1.5 text-xs">{details.map(renderDetail)}</ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {kind === "payment" ? (
            <>
              <Button asChild size="sm" variant="outline" className={buttonCls}>
                <a href={WHATSAPP_MANAGER_URL} target="_blank" rel="noopener noreferrer">
                  <CreditCard />
                  {t("addPaymentCta")}
                </a>
              </Button>
              <Button asChild size="sm" variant="outline" className={buttonCls}>
                <a href={META_PAYMENT_HELP_URL} target="_blank" rel="noopener noreferrer">
                  <ExternalLink />
                  {t("howToCta")}
                </a>
              </Button>
              {showResolve && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={buttonCls}
                  onClick={handleResolved}
                  disabled={resolving}
                >
                  {resolving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                  {t("resolvedCta")}
                </Button>
              )}
            </>
          ) : (
            <Button asChild size="sm" variant="outline" className={buttonCls}>
              <a href={WHATSAPP_MANAGER_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                {t("openManagerCta")}
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
