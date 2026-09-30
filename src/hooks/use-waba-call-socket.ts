"use client"

import { useEffect, useRef } from "react"
import { getSocket } from "@/lib/socket"
import { useAuthStore } from "@/stores/auth-store"
import { useWabaCallStore, WabaCallInfo } from "@/stores/waba-call-store"

interface WabaCallIncomingPayload {
  callId: string
  from: string
  to: string
  phoneNumberId: string
  channelId?: number
  direction: 'USER_INITIATED' | 'BUSINESS_INITIATED'
  sdpOffer?: string
  contactName?: string
  contactPic?: string
}

interface WabaCallAnswerPayload {
  callId: string
  sdpAnswer: string
}

interface WabaCallStatusPayload {
  callId: string
  status: 'RINGING' | 'ACCEPTED' | 'REJECTED'
}

interface WabaCallTerminatedPayload {
  callId: string
  duration?: number
  status?: string
  direction?: string
}

interface WabaCallClaimedPayload {
  callId: string
  userId?: number | string
}

interface UseWabaCallSocketOptions {
  onIncomingCall?: (payload: WabaCallIncomingPayload) => void
  onCallAnswer?: (payload: WabaCallAnswerPayload) => void
  onCallStatus?: (payload: WabaCallStatusPayload) => void
  onCallTerminated?: (payload: WabaCallTerminatedPayload) => void
  onCallClaimed?: (payload: WabaCallClaimedPayload) => void
}

export function useWabaCallSocket({
  onIncomingCall,
  onCallAnswer,
  onCallStatus,
  onCallTerminated,
  onCallClaimed
}: UseWabaCallSocketOptions) {
  const { user, isAuthenticated } = useAuthStore()
  const registeredRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated || !user?.tenantId || registeredRef.current) return

    const socket = getSocket()
    const tenantId = user.tenantId

    // Prefixos SEPARADOS POR TIPO DE EVENTO.
    //
    // Chamada recebida: só o prefixo do WABA. Dialog360 e Gupshup têm provider
    // próprio; escutar os três aqui abria DOIS modais e tocava DUAS vezes para a
    // mesma chamada de BSP.
    const INCOMING_PREFIXES = ["waba"] as const
    // Ciclo de vida: os TRÊS prefixos, de propósito. A chamada de SAÍDA de
    // Dialog360/Gupshup usa o RTC e o store do WABA (ticket-detail.tsx), mas o
    // sdpAnswer volta em `<tenant>:dialog360:call:answer` / `:gupshup:...`.
    // Estreitar esta lista para ["waba"] quebra o outbound dos dois BSPs: o
    // answer nunca chega ao PeerConnection certo, o áudio não conecta e o store
    // fica preso em pre_accepting. NÃO "limpar" para ficar igual à de cima.
    const LIFECYCLE_PREFIXES = ["waba", "gupshup", "dialog360"] as const

    const handleIncoming = (payload: WabaCallIncomingPayload) => {
      onIncomingCall?.(payload)
    }
    const handleAnswer = (payload: WabaCallAnswerPayload) => {
      onCallAnswer?.(payload)
    }
    const handleStatus = (payload: WabaCallStatusPayload) => {
      onCallStatus?.(payload)
    }
    const handleTerminated = (payload: WabaCallTerminatedPayload) => {
      onCallTerminated?.(payload)
    }
    const handleClaimed = (payload: WabaCallClaimedPayload) => {
      onCallClaimed?.(payload)
    }

    const registered: Array<[string, (p: any) => void]> = []
    for (const prefix of INCOMING_PREFIXES) {
      const evt = `${tenantId}:${prefix}:call:incoming`
      socket.on(evt, handleIncoming)
      registered.push([evt, handleIncoming])
    }
    for (const prefix of LIFECYCLE_PREFIXES) {
      const evts: Array<[string, (p: any) => void]> = [
        [`${tenantId}:${prefix}:call:answer`, handleAnswer],
        [`${tenantId}:${prefix}:call:status`, handleStatus],
        [`${tenantId}:${prefix}:call:terminated`, handleTerminated],
        [`${tenantId}:${prefix}:call:claimed`, handleClaimed],
      ]
      for (const [evt, fn] of evts) {
        socket.on(evt, fn)
        registered.push([evt, fn])
      }
    }

    registeredRef.current = true

    return () => {
      for (const [evt, fn] of registered) socket.off(evt, fn)
      registeredRef.current = false
    }
  }, [isAuthenticated, user?.tenantId, onIncomingCall, onCallAnswer, onCallStatus, onCallTerminated, onCallClaimed])
}
