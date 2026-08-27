"use client"

import { useEffect, useRef, useState } from "react"
import { motion, type PanInfo } from "framer-motion"
import { PhoneCall, PhoneOff, Mic, MicOff, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useDialog360CallStore } from "@/stores/dialog360-call-store"
import {
  useDialog360CallActions,
  getDialog360Rtc,
} from "./dialog360-call-provider"

const STORAGE_KEY = "dialog360-call-modal-position"

function formatDuration(s: number) {
  const m = Math.floor(s / 60)
    .toString()
    .padStart(2, "0")
  const sec = (s % 60).toString().padStart(2, "0")
  return `${m}:${sec}`
}

export function Dialog360CallModal() {
  const t = useTranslations("dialog360Calls")
  const tCommon = useTranslations("common")
  const { state, callInfo, isMuted, setMuted } = useDialog360CallStore()
  const { accept, decline, hangup } = useDialog360CallActions()
  const [seconds, setSeconds] = useState(0)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [progress, setProgress] = useState(100)
  const constraintsRef = useRef<HTMLDivElement>(null)
  const acceptBtnRef = useRef<HTMLButtonElement>(null)
  const ringingFocusDoneRef = useRef(false)

  const isVisible = state !== "idle"

  // Posição persistida no localStorage.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setPosition(JSON.parse(saved))
      else setPosition({ x: window.innerWidth - 360, y: 80 })
    } catch {
      // ignore
    }
  }, [])

  function handleDragEnd(_: unknown, info: PanInfo) {
    const next = {
      x: position.x + info.offset.x,
      y: position.y + info.offset.y,
    }
    setPosition(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  // Timer de chamada ativa.
  useEffect(() => {
    if (state !== "active") {
      setSeconds(0)
      return
    }
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [state])

  // Countdown de 30s para o estado "ringing".
  useEffect(() => {
    if (state !== "ringing") {
      setProgress(100)
      return
    }
    setProgress(100)
    const start = Date.now()
    const id = setInterval(() => {
      setProgress(Math.max(0, 100 - ((Date.now() - start) / 30000) * 100))
    }, 200)
    return () => clearInterval(id)
  }, [state])

  // Ringtone gerado via Web Audio API.
  useEffect(() => {
    if (state !== "ringing") return
    const ctx = new AudioContext()
    let stopped = false
    function beep() {
      if (stopped) return
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 480
      gain.gain.setValueAtTime(0.25, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
      osc.start()
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
  }, [state])

  // Foco programático no botão Atender ao ENTRAR em "ringing" (chamada recebida),
  // permitindo atender com Enter. A flag garante uma única tomada de foco por
  // episódio de ringing — não re-rouba o foco se o usuário já interagiu.
  useEffect(() => {
    if (state !== "ringing") {
      ringingFocusDoneRef.current = false
      return
    }
    if (ringingFocusDoneRef.current) return
    if (callInfo?.direction !== "USER_INITIATED") return
    if (!acceptBtnRef.current) return
    ringingFocusDoneRef.current = true
    acceptBtnRef.current.focus({ preventScroll: true })
  }, [state, callInfo])

  function toggleMute() {
    const next = !isMuted
    setMuted(next)
    try {
      getDialog360Rtc().setMuted(next)
    } catch {
      // ignore
    }
  }

  if (!isVisible || !callInfo) return null

  const displayName = callInfo.contactName || callInfo.from || callInfo.to
  const isIncoming = callInfo.direction === "USER_INITIATED"
  const isActive = state === "active" || state === "pre_accepting"
  const isEnded = state === "ended"

  return (
    <div
      ref={constraintsRef}
      className="fixed inset-0 z-50 pointer-events-none"
    >
      <motion.div
        drag
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        initial={{ x: position.x || window.innerWidth - 360, y: position.y || 80 }}
        style={{ x: position.x || window.innerWidth - 360, y: position.y || 80 }}
        className="pointer-events-auto absolute"
      >
        <Card
          role={state === "ringing" && isIncoming ? "alertdialog" : "dialog"}
          aria-live={state === "ringing" && isIncoming ? "assertive" : undefined}
          aria-label={state === "ringing" && isIncoming ? t("incoming") : displayName}
          className="w-[280px] shadow-2xl border-2 overflow-hidden select-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between bg-muted/50 border-b border-border px-4 py-2 cursor-grab active:cursor-grabbing">
            <div className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full ${
                  isActive
                    ? "bg-success animate-pulse"
                    : state === "ringing"
                      ? "bg-warning animate-pulse"
                      : isEnded
                        ? "bg-muted-foreground"
                        : "bg-muted-foreground"
                }`}
              />
              <span className="text-xs font-semibold text-foreground">
                Dialog360
              </span>
            </div>
            {isEnded && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => useDialog360CallStore.getState().reset()}
                aria-label={tCommon("close")}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* Body */}
          <div className="bg-card px-4 py-5 flex flex-col items-center gap-4">
            {callInfo.contactPic ? (
              <img
                src={callInfo.contactPic}
                alt={displayName}
                className="w-16 h-16 rounded-full object-cover ring-2 ring-border"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center ring-2 ring-border">
                <span className="text-foreground text-2xl font-semibold">
                  {displayName?.charAt(0)?.toUpperCase() ?? "?"}
                </span>
              </div>
            )}

            <div className="text-center">
              <p className="text-card-foreground font-semibold text-sm leading-tight">
                {displayName}
              </p>
              <p className="text-muted-foreground text-xs mt-0.5">
                {isEnded
                  ? t("ended")
                  : state === "pre_accepting"
                    ? t("connecting")
                    : isActive
                      ? formatDuration(seconds)
                      : state === "ringing"
                        ? isIncoming
                          ? t("incoming")
                          : t("calling")
                        : ""}
              </p>
            </div>

            {state === "ringing" && isIncoming && (
              <div aria-hidden="true" className="w-full h-0.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-warning transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}

            <div className="flex items-center gap-4 mt-1">
              {/* Incoming ringing: accept + decline */}
              {state === "ringing" && isIncoming && (
                <>
                  <button
                    type="button"
                    onClick={decline}
                    aria-label={t("decline")}
                    className="flex flex-col items-center gap-1 group"
                  >
                    <span className="w-12 h-12 rounded-full bg-destructive hover:bg-destructive/90 flex items-center justify-center transition-colors">
                      <PhoneOff className="w-5 h-5 text-destructive-foreground" />
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {t("decline")}
                    </span>
                  </button>
                  <button
                    type="button"
                    ref={acceptBtnRef}
                    onClick={accept}
                    aria-label={t("accept")}
                    className="flex flex-col items-center gap-1 group"
                  >
                    <span className="w-12 h-12 rounded-full bg-success hover:bg-success/90 flex items-center justify-center transition-colors animate-pulse">
                      <PhoneCall className="w-5 h-5 text-success-foreground" />
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {t("accept")}
                    </span>
                  </button>
                </>
              )}

              {/* Active / pre_accepting / outgoing ringing: mute + hangup */}
              {(isActive || (state === "ringing" && !isIncoming)) && (
                <>
                  <button
                    type="button"
                    onClick={toggleMute}
                    aria-label={isMuted ? t("unmute") : t("mute")}
                    className="flex flex-col items-center gap-1"
                  >
                    <span
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                        isMuted
                          ? "bg-destructive hover:bg-destructive/90"
                          : "bg-muted hover:bg-muted/80"
                      }`}
                    >
                      {isMuted ? (
                        <MicOff className="w-4 h-4 text-destructive-foreground" />
                      ) : (
                        <Mic className="w-4 h-4 text-foreground" />
                      )}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {isMuted ? t("unmute") : t("mute")}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={hangup}
                    aria-label={t("hangup")}
                    className="flex flex-col items-center gap-1"
                  >
                    <span className="w-10 h-10 rounded-full bg-destructive hover:bg-destructive/90 flex items-center justify-center transition-colors">
                      <PhoneOff className="w-4 h-4 text-destructive-foreground" />
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {t("hangup")}
                    </span>
                  </button>
                </>
              )}

              {isEnded && (
                <span className="text-muted-foreground text-sm">{t("ended")}</span>
              )}
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  )
}
