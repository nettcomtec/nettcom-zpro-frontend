"use client"

import { useEffect, useRef } from "react"
import { getSocket } from "@/lib/socket"
import { useAuthStore } from "@/stores/auth-store"

interface GupshupCallIncomingPayload {
  callId: string
  from: string
  to: string
  phoneNumberId: string
  channelId?: number
  appId?: string | null
  direction: "USER_INITIATED" | "BUSINESS_INITIATED"
  sdpOffer?: string
  contactName?: string
  contactPic?: string
}

interface GupshupCallAnswerPayload {
  callId: string
  sdpAnswer: string
}

interface GupshupCallStatusPayload {
  callId: string
  status: "RINGING" | "ACCEPTED" | "REJECTED"
}

interface GupshupCallTerminatedPayload {
  callId: string
  duration?: number
  status?: string
  direction?: string
}

interface GupshupCallClaimedPayload {
  callId: string
  userId?: number | string
}

interface UseGupshupCallSocketOptions {
  onIncomingCall?: (payload: GupshupCallIncomingPayload) => void
  onCallAnswer?: (payload: GupshupCallAnswerPayload) => void
  onCallStatus?: (payload: GupshupCallStatusPayload) => void
  onCallTerminated?: (payload: GupshupCallTerminatedPayload) => void
  onCallClaimed?: (payload: GupshupCallClaimedPayload) => void
}

export function useGupshupCallSocket({
  onIncomingCall,
  onCallAnswer,
  onCallStatus,
  onCallTerminated,
  onCallClaimed,
}: UseGupshupCallSocketOptions) {
  const { user, isAuthenticated } = useAuthStore()
  const registeredRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated || !user?.tenantId || registeredRef.current) return

    const socket = getSocket()
    if (!socket) return
    const tenantId = user.tenantId

    const incomingEvent = `${tenantId}:gupshup:call:incoming`
    const answerEvent = `${tenantId}:gupshup:call:answer`
    const statusEvent = `${tenantId}:gupshup:call:status`
    const terminatedEvent = `${tenantId}:gupshup:call:terminated`
    const claimedEvent = `${tenantId}:gupshup:call:claimed`

    const handleIncoming = (payload: GupshupCallIncomingPayload) => {
      onIncomingCall?.(payload)
    }
    const handleAnswer = (payload: GupshupCallAnswerPayload) => {
      onCallAnswer?.(payload)
    }
    const handleStatus = (payload: GupshupCallStatusPayload) => {
      onCallStatus?.(payload)
    }
    const handleTerminated = (payload: GupshupCallTerminatedPayload) => {
      onCallTerminated?.(payload)
    }
    const handleClaimed = (payload: GupshupCallClaimedPayload) => {
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
