"use client"

import { useEffect, useRef, useState } from "react"
import { PhoneCall, PhoneOff } from "lucide-react"
import { useTranslations } from "next-intl"
import { useDialog360CallStore } from "@/stores/dialog360-call-store"
import { useDialog360CallActions } from "./dialog360-call-provider"

export function Dialog360IncomingCallModal() {
  const t = useTranslations("dialog360Calls")
  const { state, callInfo } = useDialog360CallStore()
  const { accept, decline } = useDialog360CallActions()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [progress, setProgress] = useState(100)

  const isVisible =
    state === "ringing" && callInfo?.direction === "USER_INITIATED"

  useEffect(() => {
    if (!isVisible) {
      audioRef.current?.pause()
      return
    }
    const ctx = new AudioContext()
    let stopped = false

    function beep() {
      if (stopped) return
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 480
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.6)
      setTimeout(() => {
        if (!stopped) beep()
      }, 1800)
    }
    beep()

    return () => {
      stopped = true
      ctx.close()
    }
  }, [isVisible])

  // Barra de progresso de 30s.
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
        {/* Avatar */}
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

        {/* Info */}
        <div className="text-center">
          <p className="text-card-foreground font-semibold text-lg">{displayName}</p>
          {callInfo.contactName && (
            <p className="text-muted-foreground text-sm">{callInfo.from}</p>
          )}
          <p className="text-muted-foreground text-xs mt-1">{t("incoming")}</p>
        </div>

        {/* Progress bar */}
        <div aria-hidden="true" className="w-full h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-success transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Botões */}
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
