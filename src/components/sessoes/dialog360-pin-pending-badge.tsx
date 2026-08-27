"use client"

import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface Props {
  /** `dialog360Channels.channelStatus` ou Whatsapp.type guard. */
  type?: string
  channelStatus?: string | null
  /** Override manual; útil quando o backend já enviou um flag. */
  pending?: boolean
  className?: string
  onClick?: () => void
}

/**
 * Indica que o canal Dialog360 NÃO está em estado "running" (provisioning
 * pendente). 360dialog não usa PIN da Cloud API (PIN/2FA é gerenciado no
 * WABA Manager por humanos), porém o badge "Pendente" reaproveita o padrão
 * visual para sinalizar que o canal precisa de atenção do operador.
 */
export function Dialog360PinPendingBadge({
  type,
  channelStatus,
  pending,
  className,
  onClick,
}: Props) {
  const t = useTranslations("dialog360PinPending")

  const isPending =
    pending === true ||
    (type === "dialog360" &&
      typeof channelStatus === "string" &&
      channelStatus !== "running" &&
      channelStatus !== "active")

  if (!isPending) return null

  const badge = (
    <Badge
      variant="outline"
      onClick={onClick}
      className={cn(
        "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700",
        onClick && "cursor-pointer hover:bg-amber-200 dark:hover:bg-amber-900/50",
        className,
      )}
    >
      {t("badge")}
    </Badge>
  )

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <p className="font-medium">{t("tooltipTitle")}</p>
          <p>{t("tooltipBody")}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
