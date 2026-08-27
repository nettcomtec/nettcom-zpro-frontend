"use client"

import { useEffect, useState } from "react"
import { Loader2, BadgeCheck, BadgeAlert, BadgeX, Badge as BadgeIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  fetchGupshupPhoneQualityRating,
  gupshupQualityRatingBadgeClasses,
} from "@/lib/gupshup-phone-quality"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

type Props = {
  appId?: string | null
  whatsappId?: number | null
  phoneHint?: string | null
  loadingLabel: string
  tooltipTitle: string
  tooltipBody?: string
  className?: string
  /** Renderiza como ícone colorido (BadgeCheck/Alert/X) em vez de Badge text. */
  asIcon?: boolean
}

export function GupshupConnectionQualityBadge({
  appId,
  whatsappId,
  phoneHint,
  loadingLabel,
  tooltipTitle,
  tooltipBody,
  className,
  asIcon = false,
}: Props) {
  const [rating, setRating] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [errored, setErrored] = useState(false)

  const hasIdentity = !!(
    (appId && appId.trim()) ||
    (typeof whatsappId === "number" && whatsappId > 0)
  )

  useEffect(() => {
    let cancelled = false
    if (!hasIdentity) {
      setRating(null)
      setErrored(false)
      return
    }
    setLoading(true)
    setErrored(false)
    fetchGupshupPhoneQualityRating({
      appId,
      whatsappId,
      phoneHint,
    })
      .then((res) => {
        if (cancelled) return
        if (res.error) {
          setErrored(true)
          setRating(null)
        } else {
          setRating(res.quality_rating ?? null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [appId, whatsappId, phoneHint, hasIdentity])

  if (!hasIdentity) return null

  if (loading) {
    if (asIcon) {
      return <Loader2 className={cn("w-3 h-3 animate-spin text-muted-foreground flex-shrink-0", className)} />
    }
    return (
      <Badge variant="outline" className={className}>
        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
        {loadingLabel}
      </Badge>
    )
  }

  // Mesmo se erro/null, mostra badge "UNKNOWN" (cinza) pra dar feedback visual
  // em vez de sumir silenciosamente.
  const displayRating = rating ?? "UNKNOWN"

  if (asIcon) {
    const r = (displayRating ?? "").toUpperCase()
    const { Icon, iconCls } = r === "GREEN"
      ? { Icon: BadgeCheck, iconCls: "text-green-500 dark:text-green-400 fill-green-500/15" }
      : r === "YELLOW"
        ? { Icon: BadgeAlert, iconCls: "text-yellow-500 dark:text-yellow-400 fill-yellow-500/15" }
        : r === "RED"
          ? { Icon: BadgeX, iconCls: "text-red-500 dark:text-red-400 fill-red-500/15" }
          : { Icon: BadgeIcon, iconCls: "text-muted-foreground/60" }
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Icon
              role="status"
              aria-label={`${tooltipTitle}: ${displayRating}`}
              className={cn("w-4 h-4 flex-shrink-0", iconCls, className)}
            />
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-medium">{tooltipTitle}</p>
            <p className="text-xs">{displayRating}</p>
            {tooltipBody ? <p className="text-xs">{tooltipBody}</p> : null}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  const colorClasses = gupshupQualityRatingBadgeClasses(displayRating)
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className={cn(colorClasses, className)}>{displayRating}</Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">{tooltipTitle}</p>
          {tooltipBody ? <p className="text-xs">{tooltipBody}</p> : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
