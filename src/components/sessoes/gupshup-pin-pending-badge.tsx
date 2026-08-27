"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { healthCheckGupshup } from "@/services/gupshup-health"

interface Props {
  type?: string
  whatsappId?: number | null
  appId?: string | null
  enabled?: boolean
  className?: string
  onClick?: () => void
}

const CACHE_TTL_MS = 5 * 60 * 1000
type CacheEntry = { pending: boolean; ts: number }
const cache = new Map<string, CacheEntry>()
const subscribers = new Set<() => void>()
let cacheVersion = 0

function notifySubscribers() {
  cacheVersion++
  subscribers.forEach((cb) => cb())
}

export function invalidateGupshupPinPendingCache(opts?: {
  whatsappId?: number
}) {
  if (opts?.whatsappId) {
    const prefix = `${opts.whatsappId}::`
    for (const key of [...cache.keys()]) {
      if (key.startsWith(prefix)) cache.delete(key)
    }
  } else {
    cache.clear()
  }
  notifySubscribers()
}

/**
 * Badge "Pendente" para canais Gupshup que ainda nao concluiram o setup
 * (app_token expirado, phone nao registrado no V3 passthrough, webhook nao
 * configurado). Probe usa o health-check unico do backend Gupshup —
 * /gupshup/channels/:id/health.
 */
export function GupshupPinPendingBadge({
  type,
  whatsappId,
  appId,
  enabled = true,
  className,
  onClick,
}: Props) {
  const t = useTranslations("sessoesPage")
  const [pending, setPending] = useState<boolean | null>(null)
  const [, setVersion] = useState(cacheVersion)

  useEffect(() => {
    const cb = () => setVersion(cacheVersion)
    subscribers.add(cb)
    return () => {
      subscribers.delete(cb)
    }
  }, [])

  useEffect(() => {
    if (!enabled || type !== "gupshup" || !whatsappId) {
      setPending(null)
      return
    }
    const key = `${whatsappId}::${appId || ""}`
    const cached = cache.get(key)
    const now = Date.now()
    if (cached && now - cached.ts < CACHE_TTL_MS) {
      setPending(cached.pending)
      return
    }
    let cancelled = false
    healthCheckGupshup(whatsappId)
      .then(({ data }) => {
        if (cancelled) return
        const needs = !data?.ok
        cache.set(key, { pending: needs, ts: Date.now() })
        setPending(needs)
      })
      .catch(() => {
        if (cancelled) return
        cache.set(key, { pending: false, ts: Date.now() })
        setPending(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, type, whatsappId, appId, cacheVersion])

  if (pending !== true) return null

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
      {t("pinPendingBadge")}
    </Badge>
  )

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
  )
}
