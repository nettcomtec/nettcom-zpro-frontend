"use client";

import { useTranslations } from "next-intl";
import { ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWabaPinPending } from "@/hooks/use-waba-pin-pending";
import { cn } from "@/lib/utils";

interface Props {
  type?: string;
  tokenAPI?: string | null;
  bmToken?: string | null;
  wabaVersion?: string | null;
  webhookOrigin?: string | null;
  enabled?: boolean;
  className?: string;
  onClick?: () => void;
  /** Icone com tooltip em vez de badge de texto (padrao dos badges do card). */
  asIcon?: boolean;
}

/**
 * Mostra "Pendente" para canais WABA que ainda precisam registrar o PIN
 * via Cloud API. Quando onClick e fornecido, vira clicavel para abrir o
 * dialog de registro.
 */
export function WabaPinPendingBadge({
  type,
  tokenAPI,
  bmToken,
  wabaVersion,
  webhookOrigin,
  enabled = true,
  className,
  onClick,
  asIcon = false,
}: Props) {
  const t = useTranslations("sessoesPage");
  const { pending } = useWabaPinPending({ type, tokenAPI, bmToken, wabaVersion, webhookOrigin, enabled });

  if (pending !== true) return null;

  const badge = asIcon ? (
    <ShieldAlert
      role="status"
      aria-label={t("pinPendingBadge")}
      onClick={onClick}
      className={cn(
        "w-4 h-4 text-amber-500 dark:text-amber-400 fill-amber-500/15 flex-shrink-0",
        onClick && "cursor-pointer hover:opacity-80",
        className,
      )}
    />
  ) : (
    <Badge
      variant="outline"
      onClick={onClick}
      className={cn(
        "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700",
        onClick && "cursor-pointer hover:bg-amber-200 dark:hover:bg-amber-900/50",
        className,
      )}
    >
      {t("pinPendingBadge")}
    </Badge>
  );

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <p className="font-medium">{t("pinPendingTooltipTitle")}</p>
          <p>{t("pinPendingTooltipBody")}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
