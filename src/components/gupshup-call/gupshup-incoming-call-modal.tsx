"use client"

import { useEffect, useState } from "react"
import { PhoneCall, PhoneOff } from "lucide-react"
import { useTranslations } from "next-intl"
import { startCallRingtone } from "@/lib/call-ringtone"
import { useGupshupCallStore } from "@/stores/gupshup-call-store"
import { useGupshupCallActions } from "./gupshup-call-provider"

export function GupshupIncomingCallModal() {
  const t = useTranslations("gupshupCalls")
  const { state, callInfo } = useGupshupCallStore()
  const { accept, decline } = useGupshupCallActions()
  const [progress, setProgress] = useState(100)

  const isVisible =
    state === "ringing" && callInfo?.direction === "USER_INITIATED"

  // Ringtone: arquivo de public/ quando existir, senão o beep sintetizado de
  // sempre. Ver lib/call-ringtone.ts.
  useEffect(() => {
    if (!isVisible) return
    return startCallRingtone()
  }, [isVisible])

  useEffect(() => {
    if (!isVisible) {
      setProgress(100)
      return
    }
    setProgress(100)
    const start = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - start
      const remaining = Math.max(0, 100 - (elapsed / 30000) * 100)
      setProgress(remaining)
    }, 200)
    return () => clearInterval(interval)
  }, [isVisible])

  if (!isVisible || !callInfo) return null

  const displayName = callInfo.contactName || callInfo.from

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-live="assertive"
        aria-label={t("incoming")}
        className="relative w-80 rounded-2xl border border-border bg-card p-6 shadow-2xl flex flex-col items-center gap-4"
      >
        <div className="relative">
          {callInfo.contactPic ? (
            <img
              src={callInfo.contactPic}
              alt={displayName}
              className="w-20 h-20 rounded-full object-cover ring-4 ring-success/40"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center ring-4 ring-success/40">
              <span className="text-foreground text-2xl font-semibold">
                {displayName.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        <div className="text-center">
          <p className="text-card-foreground font-semibold text-lg">{displayName}</p>
          {callInfo.contactName && (
            <p className="text-muted-foreground text-sm">{callInfo.from}</p>
          )}
          <p className="text-muted-foreground text-xs mt-1">{t("incoming")}</p>
        </div>

        <div aria-hidden="true" className="w-full h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-success transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex gap-8 mt-2">
          <button
            type="button"
            onClick={decline}
            className="flex flex-col items-center gap-1 group"
            aria-label={t("decline")}
          >
            <span className="w-14 h-14 rounded-full bg-destructive hover:bg-destructive/90 flex items-center justify-center transition-colors">
              <PhoneOff className="w-6 h-6 text-destructive-foreground" />
            </span>
            <span className="text-muted-foreground text-xs">{t("decline")}</span>
          </button>

          <button
            type="button"
            onClick={accept}
            className="flex flex-col items-center gap-1 group"
            aria-label={t("accept")}
          >
            <span className="w-14 h-14 rounded-full bg-success hover:bg-success/90 flex items-center justify-center transition-colors animate-pulse">
              <PhoneCall className="w-6 h-6 text-success-foreground" />
            </span>
            <span className="text-muted-foreground text-xs">{t("accept")}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
