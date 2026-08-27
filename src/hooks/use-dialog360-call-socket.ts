"use client"

import { useEffect, useRef } from "react"
import { getSocket } from "@/lib/socket"
import { useAuthStore } from "@/stores/auth-store"

interface Dialog360CallIncomingPayload {
  callId: string
  from: string
  to: string
  phoneNumberId: string
  channelId?: number
  direction: "USER_INITIATED" | "BUSINESS_INITIATED"
  sdpOffer?: string
  contactName?: string
  contactPic?: string
}

interface Dialog360CallAnswerPayload {
  callId: string
  sdpAnswer: string
}

interface Dialog360CallStatusPayload {
  callId: string
  status: "RINGING" | "ACCEPTED" | "REJECTED"
}

interface Dialog360CallTerminatedPayload {
  callId: string
  duration?: number
  status?: string
  direction?: string
}

interface Dialog360CallClaimedPayload {
  callId: string
  userId?: number | string
}

interface UseDialog360CallSocketOptions {
  onIncomingCall?: (payload: Dialog360CallIncomingPayload) => void
  onCallAnswer?: (payload: Dialog360CallAnswerPayload) => void
  onCallStatus?: (payload: Dialog360CallStatusPayload) => void
  onCallTerminated?: (payload: Dialog360CallTerminatedPayload) => void
  onCallClaimed?: (payload: Dialog360CallClaimedPayload) => void
}

/**
 * Escuta sockets de Calls Dialog360 (`${tenantId}:dialog360:call:*`).
 * Espelhamento de `useWabaCallSocket` mas em namespace próprio para
 * evitar colisão de eventos.
 */
export function useDialog360CallSocket({
  onIncomingCall,
  onCallAnswer,
  onCallStatus,
  onCallTerminated,
  onCallClaimed,
}: UseDialog360CallSocketOptions) {
  const { user, isAuthenticated } = useAuthStore()
  const registeredRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated || !user?.tenantId || registeredRef.current) return

    const socket = getSocket()
    const tenantId = user.tenantId

    const incomingEvent = `${tenantId}:dialog360:call:incoming`
    const answerEvent = `${tenantId}:dialog360:call:answer`
    const statusEvent = `${tenantId}:dialog360:call:status`
    const terminatedEvent = `${tenantId}:dialog360:call:terminated`
    const claimedEvent = `${tenantId}:dialog360:call:claimed`

    const handleIncoming = (payload: Dialog360CallIncomingPayload) => {
      onIncomingCall?.(payload)
    }
    const handleAnswer = (payload: Dialog360CallAnswerPayload) => {
      onCallAnswer?.(payload)
    }
    const handleStatus = (payload: Dialog360CallStatusPayload) => {
      onCallStatus?.(payload)
    }
    const handleTerminated = (payload: Dialog360CallTerminatedPayload) => {
      onCallTerminated?.(payload)
    }
    const handleClaimed = (payload: Dialog360CallClaimedPayload) => {
      onCallClaimed?.(payload)
    }

    socket.on(incomingEvent, handleIncoming)
    socket.on(answerEvent, handleAnswer)
    socket.on(statusEvent, handleStatus)
    socket.on(terminatedEvent, handleTerminated)
    socket.on(claimedEvent, handleClaimed)

    registeredRef.current = true

    return () => {
      socket.off(incomingEvent, handleIncoming)
      socket.off(answerEvent, handleAnswer)
      socket.off(statusEvent, handleStatus)
      socket.off(terminatedEvent, handleTerminated)
      socket.off(claimedEvent, handleClaimed)
      registeredRef.current = false
    }
  }, [
    isAuthenticated,
    user?.tenantId,
    onIncomingCall,
    onCallAnswer,
    onCallStatus,
    onCallTerminated,
    onCallClaimed,
  ])
}
