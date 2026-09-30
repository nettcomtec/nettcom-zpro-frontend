"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, BadgeCheck, BadgeAlert, BadgeX, Badge as BadgeIcon, Smartphone, CloudCog, Ban, ShieldAlert, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  fetchWabaPhoneQualityRating,
  qualityRatingBadgeClasses,
  resolveWabaGraphAccessToken,
  classifyWabaPhoneStatus,
  isWabaPhoneStatusProblem,
  wabaPhoneStatusBadgeClasses,
  wabaPhoneStatusI18nKey,
} from "@/lib/waba-phone-quality";
import { findSendHealthByPhoneNumberId, useMetaSendHealth } from "@/lib/meta-send-health";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Props = {
  bmToken?: string | null;
  tokenAPI?: string | null;
  wabaId?: string | null;
  phoneHint?: string | null;
  wabaVersion?: string | null;
  loadingLabel: string;
  tooltipTitle: string;
  tooltipBody?: string;
  className?: string;
  asIcon?: boolean;
  /** Exibe badge Coex/Cloud API ao lado do badge de qualidade (mesmo fetch). */
  showPlatform?: boolean;
  platformCoexLabel?: string;
  platformCloudLabel?: string;
  platformCoexTooltip?: string;
  platformCloudTooltip?: string;
  /** Não mostra o selo de pagamento/bloqueio de envio (quem já exibe o aviso do canal, como o card de /sessoes). */
  hideSendHealth?: boolean;
};

export function WabaConnectionQualityBadge({
  bmToken,
  tokenAPI,
  wabaId,
  phoneHint,
  wabaVersion,
  loadingLabel,
  tooltipTitle,
  tooltipBody,
  className,
  asIcon = false,
  showPlatform = false,
  platformCoexLabel,
  platformCloudLabel,
  platformCoexTooltip,
  platformCloudTooltip,
  hideSendHealth = false,
}: Props) {
  const tStatus = useTranslations("metaHealth");
  const tSend = useTranslations("metaSendHealth");
  // Alerta de envio (pagamento/bloqueio) vem do cache compartilhado, sem request
  // próprio; casa só pelo phone_number_id do canal (tokenAPI), nunca pelo número exibido.
  const sendHealthRows = useMetaSendHealth(!hideSendHealth);
  const [rating, setRating] = useState<string | null>(null);
  const [phoneStatus, setPhoneStatus] = useState<string | null>(null);
  const [platform, setPlatform] = useState<{ platformType?: string; isOnBizApp?: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);

  const hasToken = !!resolveWabaGraphAccessToken({ bmToken, tokenAPI });
  const hasWaba = !!(wabaId && wabaId.trim());

  useEffect(() => {
    let cancelled = false;
    if (!hasToken || !hasWaba) {
      setRating(null);
      setErrored(false);
      return;
    }
    setLoading(true);
    setErrored(false);
    fetchWabaPhoneQualityRating({
      bmToken,
      tokenAPI,
      wabaId,
      phoneHint,
      wabaVersion,
    })
      .then((res) => {
        if (cancelled) return;
        if (res.error) {
          setErrored(true);
          setRating(null);
          setPhoneStatus(null);
          setPlatform(null);
        } else {
          setRating(res.quality_rating ?? null);
          setPhoneStatus(res.status ?? null);
          setPlatform({ platformType: res.platform_type, isOnBizApp: res.is_on_biz_app });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bmToken, tokenAPI, wabaId, phoneHint, wabaVersion, hasToken, hasWaba]);

  // Selo de envio (docs/PLANO_ALERTA_PAGAMENTO_WABA.md, F5): pagamento recusado (131042)
  // ou envio bloqueado pela Meta. Calculado antes dos retornos antecipados para aparecer
  // também sem token/WABA, durante o carregamento e sem quality_rating. "limited" não entra.
  const sendHealthNode = (() => {
    if (hideSendHealth) return null;
    const sendHealth = findSendHealthByPhoneNumberId(sendHealthRows, tokenAPI);
    if (!sendHealth || (sendHealth.kind !== "payment" && sendHealth.kind !== "blocked")) return null;
    const isPayment = sendHealth.kind === "payment";
    const label = isPayment ? tSend("badgePayment") : tSend("badgeBlocked");
    const tip = tSend("badgeTooltip");
    const SendIcon = isPayment ? CreditCard : ShieldAlert;

    if (asIcon) {
      const iconCls = isPayment ? "text-red-500 dark:text-red-400" : "text-amber-500 dark:text-amber-400";
      return (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <SendIcon role="status" aria-label={label} className={cn("w-4 h-4 flex-shrink-0", iconCls, className)} />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="font-medium">{label}</p>
              <p className="text-xs">{tip}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    const badgeCls = isPayment
      ? "bg-red-500 hover:bg-red-500/90 text-white border-transparent"
      : "bg-amber-500 hover:bg-amber-500/90 text-white border-transparent";
    const badge = (
      <Badge role="status" className={cn(badgeCls, "gap-1 whitespace-nowrap", className)}>
        <SendIcon className="w-3 h-3" />
        {label}
      </Badge>
    );
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>{badge}</TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-xs">{tip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  })();

  if (!hasToken || !hasWaba) return sendHealthNode;

  if (loading) {
    if (asIcon) {
      return (
        <>
          {sendHealthNode}
          <Loader2 className={cn("w-3 h-3 animate-spin text-muted-foreground flex-shrink-0", className)} />
        </>
      );
    }
    return (
      <>
        {sendHealthNode}
        <Badge variant="outline" className={className}>
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          {loadingLabel}
        </Badge>
      </>
    );
  }

  // Badge Coex/Cloud API (mesmo fetch do quality): is_on_biz_app=true indica
  // numero em coexistencia (ainda no app WhatsApp Business). Em asIcon vira
  // icone com tooltip, no padrao dos demais badges do card de sessao.
  const platformNode = (() => {
    if (!showPlatform || !platform) return null;
    const isCoex = platform.isOnBizApp === true;
    const isCloud = !isCoex && (platform.platformType || "").toUpperCase() === "CLOUD_API";
    if (!isCoex && !isCloud) return null;
    const label = isCoex ? (platformCoexLabel || "Coex") : (platformCloudLabel || "Cloud API");
    const tip = isCoex ? platformCoexTooltip : platformCloudTooltip;

    if (asIcon) {
      const PlatformIcon = isCoex ? Smartphone : CloudCog;
      const iconCls = isCoex
        ? "text-sky-500 dark:text-sky-400"
        : "text-muted-foreground/70";
      return (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PlatformIcon
                role="status"
                aria-label={label}
                className={cn("w-3.5 h-3.5 flex-shrink-0 opacity-80", iconCls)}
              />
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">{label}</p>
              {tip ? <p className="text-xs">{tip}</p> : null}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    const cls = isCoex
      ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30"
      : "bg-muted text-muted-foreground border-transparent";
    const badge = (
      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4 leading-4 font-medium flex-shrink-0 whitespace-nowrap", cls)}>
        {label}
      </Badge>
    );
    if (!tip) return badge;
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>{badge}</TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{tip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  })();

  // Badge de STATUS do número (banido/restrito/sinalizado). É distinto do quality_rating
  // e prevalece visualmente: um número BANIDO pela Meta não envia nem recebe, então o
  // operador precisa ver isso no canal. Renderiza mesmo sem quality_rating.
  const statusNode = (() => {
    if (!isWabaPhoneStatusProblem(phoneStatus)) return null;
    const sev = classifyWabaPhoneStatus(phoneStatus);
    const label = tStatus(`status.${wabaPhoneStatusI18nKey(phoneStatus)}`);
    const tip =
      sev === "banned" ? tStatus("bannedTooltip")
      : sev === "restricted" ? tStatus("restrictedTooltip")
      : label;
    const StatusIcon = sev === "banned" ? Ban : ShieldAlert;
    const isRed = sev === "banned" || sev === "restricted";

    if (asIcon) {
      const iconCls = isRed ? "text-red-500 dark:text-red-400" : "text-yellow-500 dark:text-yellow-400";
      return (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <StatusIcon role="status" aria-label={label} className={cn("w-4 h-4 flex-shrink-0", iconCls, className)} />
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">{label}</p>
              <p className="text-xs">{tip}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    const badge = (
      <Badge className={cn(wabaPhoneStatusBadgeClasses(phoneStatus), "gap-1 whitespace-nowrap", className)}>
        <StatusIcon className="w-3 h-3" />
        {label}
      </Badge>
    );
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>{badge}</TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{tip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  })();

  if (errored || !rating) {
    if (!statusNode && !sendHealthNode && !platformNode) return null;
    return <>{statusNode}{sendHealthNode}{platformNode}</>;
  }

  if (asIcon) {
    const r = (rating ?? "").toUpperCase();
    const { Icon, iconCls } = r === "GREEN"
      ? { Icon: BadgeCheck, iconCls: "text-green-500 dark:text-green-400 fill-green-500/15" }
      : r === "YELLOW"
        ? { Icon: BadgeAlert, iconCls: "text-yellow-500 dark:text-yellow-400 fill-yellow-500/15" }
        : r === "RED"
          ? { Icon: BadgeX, iconCls: "text-red-500 dark:text-red-400 fill-red-500/15" }
          : { Icon: BadgeIcon, iconCls: "text-muted-foreground/60" };
    return (
      <>
        {statusNode}
        {sendHealthNode}
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Icon
                role="status"
                aria-label={`${tooltipTitle}: ${rating}`}
                className={cn("w-4 h-4 flex-shrink-0", iconCls, className)}
              />
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">{tooltipTitle}</p>
              <p className="text-xs">{rating}</p>
              {tooltipBody ? <p className="text-xs">{tooltipBody}</p> : null}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {platformNode}
      </>
    );
  }

  const colorClasses = qualityRatingBadgeClasses(rating);
  return (
    <>
      {statusNode}
      {sendHealthNode}
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge className={cn(colorClasses, className)}>
              {rating}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-medium">{tooltipTitle}</p>
            {tooltipBody ? <p className="text-xs">{tooltipBody}</p> : null}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {platformNode}
    </>
  );
}
