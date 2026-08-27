"use client"

import { useEffect, useState } from "react"
import { Loader2, BadgeCheck, BadgeAlert, BadgeX, Badge as BadgeIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  fetchDialog360PhoneQualityRating,
  dialog360QualityRatingBadgeClasses,
} from "@/lib/dialog360-phone-quality"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

type Props = {
  /** Id do `Dialog360Channel` (1:1 com `Whatsapp` Dialog360). */
  channelId?: number | string | null
  phoneHint?: string | null
  /**
   * Quality rating já conhecido (vindo de socket `${tenantId}:dialog360:quality`
   * ou do payload do canal). Se presente, o badge usa este valor e não
   * dispara o fetch.
   */
  rating?: string | null
  loadingLabel: string
  tooltipTitle: string
  tooltipBody?: string
  className?: string
  /** Renderiza como ícone colorido (BadgeCheck/Alert/X) em vez de Badge text. */
  asIcon?: boolean
}

/**
 * Badge de qualidade do número Dialog360. Mostra GREEN/YELLOW/RED conforme
 * `qualityRating` do canal. Para tempo real, o `Dialog360Channel` recebe
 * atualizações via socket — quando há `rating` em prop, este componente
 * exibe diretamente sem novo fetch.
 */
export function Dialog360ConnectionQualityBadge({
  channelId,
  phoneHint,
  rating: ratingProp,
  loadingLabel,
  tooltipTitle,
  tooltipBody,
  className,
  asIcon = false,
}: Props) {
  const [rating, setRating] = useState<string | null>(ratingProp ?? null)
  const [loading, setLoading] = useState(false)
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    if (ratingProp) {
      setRating(ratingProp)
      setErrored(false)
      return
    }
    let cancelled = false
    if (!channelId) {
      setRating(null)
      setErrored(false)
      return
    }
    setLoading(true)
    setErrored(false)
    fetchDialog360PhoneQualityRating({ channelId, phoneHint })
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
  }, [channelId, phoneHint, ratingProp])

  if (!channelId && !ratingProp) return null

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

  // Se houve erro ou rating ainda null, exibe badge "UNKNOWN" (cinza) — antes
  // sumia (return null), o que deixava o user sem feedback se o provider
  // retorna 4xx no fallback. Sempre mostrar algo dá pista visual de status.
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

  const colorClasses = dialog360QualityRatingBadgeClasses(displayRating)
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
