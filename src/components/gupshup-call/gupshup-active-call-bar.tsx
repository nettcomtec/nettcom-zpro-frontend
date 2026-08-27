"use client"

import { useEffect, useState } from "react"
import { Mic, MicOff, PhoneOff } from "lucide-react"
import { useTranslations } from "next-intl"
import { useGupshupCallStore } from "@/stores/gupshup-call-store"
import {
  useGupshupCallActions,
  getGupshupRtc,
} from "./gupshup-call-provider"

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0")
  const s = (seconds % 60).toString().padStart(2, "0")
  return `${m}:${s}`
}

export function GupshupActiveCallBar() {
  const t = useTranslations("gupshupCalls")
  const { state, callInfo, isMuted, setMuted } = useGupshupCallStore()
  const { hangup } = useGupshupCallActions()
  const [seconds, setSeconds] = useState(0)

  const isVisible = state === "active" || state === "pre_accepting"

  useEffect(() => {
    if (!isVisible) {
      setSeconds(0)
      return
    }
    setSeconds(0)
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(interval)
  }, [isVisible])

  function toggleMute() {
    const next = !isMuted
    setMuted(next)
    try {
      getGupshupRtc().setMuted(next)
    } catch {}
  }

  if (!isVisible || !callInfo) return null

  const displayName = callInfo.contactName || callInfo.from

  return (
    <div
      role="region"
      aria-label={t("active")}
      className="fixed bottom-0 left-0 right-0 md:left-64 z-40 bg-card border-t border-border px-4 py-3 flex items-center gap-3"
    >
      {callInfo.contactPic ? (
        <img
          src={callInfo.contactPic}
          alt={displayName}
          className="w-8 h-8 rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
          <span className="text-foreground text-sm font-semibold">
            {displayName.charAt(0).toUpperCase()}
          </span>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-foreground text-sm font-medium truncate">{displayName}</p>
        <p className="text-muted-foreground text-xs">
          {state === "pre_accepting" ? t("connecting") : t("active")}
        </p>
      </div>

      {state === "active" && (
        <span className="text-success text-sm font-mono tabular-nums">
          {formatDuration(seconds)}
        </span>
      )}

      <button
        type="button"
        onClick={toggleMute}
        className="w-9 h-9 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
        aria-label={isMuted ? t("unmute") : t("mute")}
      >
        {isMuted ? (
          <MicOff className="w-4 h-4 text-destructive" />
        ) : (
          <Mic className="w-4 h-4 text-foreground" />
        )}
      </button>

      <button
        type="button"
        onClick={hangup}
        className="w-9 h-9 rounded-full bg-destructive hover:bg-destructive/90 flex items-center justify-center transition-colors"
        aria-label={t("hangup")}
      >
        <PhoneOff className="w-4 h-4 text-destructive-foreground" />
      </button>
    </div>
  )
}
