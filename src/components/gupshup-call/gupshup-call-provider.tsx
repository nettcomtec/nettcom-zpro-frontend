"use client"

import { useCallback, useEffect, useRef } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useGupshupCallStore } from "@/stores/gupshup-call-store"
import { useGupshupCallSocket } from "@/hooks/use-gupshup-call-socket"
import { GupshupWebRTC } from "@/lib/gupshup-webrtc"
import { useAuthStore } from "@/stores/auth-store"
import { createCallLog } from "@/services/call-logs"
import { getSocket } from "@/lib/socket"
import {
  preAcceptGupshupCall,
  acceptGupshupCall,
  rejectGupshupCall,
  terminateGupshupCall,
  claimGupshupCall,
} from "@/services/gupshup-calls"

const RING_TIMEOUT_MS = 30_000

// Singleton por aba — partilhado entre provider e actions hook
let _rtc: GupshupWebRTC | null = null

export function getGupshupRtc(): GupshupWebRTC {
  if (!_rtc) _rtc = new GupshupWebRTC()
  return _rtc
}

export function closeGupshupRtc() {
  _rtc?.close()
  _rtc = null
}

function createGupshupCallLog(
  callInfo: { direction?: string; from?: string; to?: string } | null,
  callStatus: string,
  duration = 0,
) {
  const { user } = useAuthStore.getState()
  if (!user || !callInfo) return
  createCallLog({
    userId: user.userId,
    tenantId: user.tenantId,
    phoneNumber:
      (callInfo.direction === "USER_INITIATED" ? callInfo.from : callInfo.to) ||
      "",
    originNumber:
      (callInfo.direction === "USER_INITIATED" ? callInfo.from : callInfo.to) ||
      "",
    destinationNumber:
      (callInfo.direction === "USER_INITIATED" ? callInfo.to : callInfo.from) ||
      "",
    callDuration: duration,
    callStatus,
  }).catch(() => {})
}

export function GupshupCallProvider() {
  const { setCall, setState, setClaimedByOther, reset } = useGupshupCallStore()
  const t = useTranslations()
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearRingTimeout() {
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current)
      ringTimeoutRef.current = null
    }
  }

  const handleIncoming = useCallback(
    (payload: {
      callId: string
      from: string
      to: string
      phoneNumberId: string
      channelId?: number
      appId?: string | null
      sdpOffer?: string
      contactName?: string
      contactPic?: string
    }) => {
      setCall({
        callId: payload.callId,
        from: payload.from,
        to: payload.to,
        phoneNumberId: payload.phoneNumberId,
        channelId: payload.channelId,
        appId: payload.appId,
        direction: "USER_INITIATED",
        sdpOffer: payload.sdpOffer,
        contactName: payload.contactName,
        contactPic: payload.contactPic,
        startedAt: Date.now(),
      })
      setClaimedByOther(false)
      setState("ringing")

      ringTimeoutRef.current = setTimeout(() => {
        const s = useGupshupCallStore.getState()
        if (s.state === "ringing" && s.callInfo?.callId === payload.callId) {
          if (!s.claimedByOther) {
            createGupshupCallLog(s.callInfo, "Missed", 0)
          }
          closeGupshupRtc()
          reset()
        }
      }, RING_TIMEOUT_MS)
    },
    [setCall, setState, setClaimedByOther, reset],
  )

  const handleCallAnswer = useCallback(
    async (payload: { sdpAnswer: string }) => {
      const rtc = getGupshupRtc()
      await rtc.setRemoteAnswer(payload.sdpAnswer).catch(() => {})
      setState("active")
    },
    [setState],
  )

  const handleCallStatus = useCallback(
    (payload: { callId: string; status: string }) => {
      const s = useGupshupCallStore.getState()
      const isLocalRingingForCall =
        s.state === "ringing" && s.callInfo?.callId === payload.callId

      if (payload.status === "ACCEPTED") {
        if (isLocalRingingForCall) {
          clearRingTimeout()
          setClaimedByOther(true)
          try {
            toast.info(t("gupshupCallProvider.answeredByOther"))
          } catch {}
          closeGupshupRtc()
          reset()
          return
        }
        setState("active")
      } else if (payload.status === "REJECTED") {
        if (isLocalRingingForCall) {
          clearRingTimeout()
          setClaimedByOther(true)
          closeGupshupRtc()
          reset()
          return
        }
        clearRingTimeout()
        closeGupshupRtc()
        reset()
      }
    },
    [setState, setClaimedByOther, reset, t],
  )

  const handleCallClaimed = useCallback(
    (payload: { callId: string }) => {
      const s = useGupshupCallStore.getState()
      if (s.state === "ringing" && s.callInfo?.callId === payload.callId) {
        clearRingTimeout()
        setClaimedByOther(true)
        try {
          toast.info(t("gupshupCallProvider.answeredByOther"))
        } catch {}
        closeGupshupRtc()
        reset()
      }
    },
    [setClaimedByOther, reset, t],
  )

  const handleCallTerminated = useCallback(
    (payload: { status?: string; duration?: number }) => {
      clearRingTimeout()
      const callInfo = useGupshupCallStore.getState().callInfo
      createGupshupCallLog(
        callInfo,
        payload.status === "Completed" ? "Completed" : "Ended",
        payload.duration || 0,
      )
      closeGupshupRtc()
      setState("ended")
      setTimeout(() => reset(), 2000)
    },
    [setState, reset],
  )

  useGupshupCallSocket({
    onIncomingCall: handleIncoming,
    onCallAnswer: handleCallAnswer,
    onCallStatus: handleCallStatus,
    onCallTerminated: handleCallTerminated,
    onCallClaimed: handleCallClaimed,
  })

  useEffect(() => {
    return () => {
      clearRingTimeout()
      closeGupshupRtc()
    }
  }, [])

  return null
}

// Hook para componentes de UI acionarem accept / decline / hangup
export function useGupshupCallActions() {
  const { callInfo, setState, setClaimedByOther, reset } = useGupshupCallStore()
  const t = useTranslations()

  const accept = useCallback(async () => {
    if (!callInfo?.sdpOffer || callInfo.channelId == null) return
    setState("pre_accepting")
    try {
      // Atomic claim no backend Gupshup ANTES de qualquer chamada externa
      try {
        await claimGupshupCall({ callId: callInfo.callId })
      } catch (err: unknown) {
        const status =
          (err as { response?: { status?: number } })?.response?.status
        if (status === 409) {
          try {
            toast.info(t("gupshupCallProvider.alreadyClaimed"))
          } catch {}
          setClaimedByOther(true)
          closeGupshupRtc()
          reset()
          return
        }
        throw err
      }

      try {
        const userId = useAuthStore.getState().user?.userId
        const tenantId = useAuthStore.getState().user?.tenantId
        if (tenantId) {
          getSocket().emit(`${tenantId}:gupshup:call:claimed`, {
            callId: callInfo.callId,
            userId,
          })
        }
      } catch {}

      const rtc = getGupshupRtc()
      const sdpAnswer = await rtc.createAnswerForOffer(callInfo.sdpOffer)
      await preAcceptGupshupCall({
        whatsappId: callInfo.channelId,
        callId: callInfo.callId,
        sdpAnswer,
      })
      await acceptGupshupCall({
        whatsappId: callInfo.channelId,
        callId: callInfo.callId,
        sdpAnswer,
      })
      setState("active")
    } catch {
      closeGupshupRtc()
      reset()
    }
  }, [callInfo, setState, setClaimedByOther, reset, t])

  const decline = useCallback(async () => {
    if (!callInfo || callInfo.channelId == null) return
    const claimedByOther = useGupshupCallStore.getState().claimedByOther
    if (claimedByOther) {
      closeGupshupRtc()
      reset()
      return
    }
    await rejectGupshupCall({
      whatsappId: callInfo.channelId,
      callId: callInfo.callId,
    }).catch(() => {})
    createGupshupCallLog(callInfo, "Missed", 0)
    closeGupshupRtc()
    reset()
  }, [callInfo, reset])

  const hangup = useCallback(async () => {
    if (!callInfo || callInfo.channelId == null) return
    const claimedByOther = useGupshupCallStore.getState().claimedByOther
    if (claimedByOther) {
      closeGupshupRtc()
      reset()
      return
    }
    await terminateGupshupCall({
      whatsappId: callInfo.channelId,
      callId: callInfo.callId,
    }).catch(() => {})
    createGupshupCallLog(
      callInfo,
      "Ended",
      useGupshupCallStore.getState().duration,
    )
    closeGupshupRtc()
    setState("ended")
    setTimeout(() => reset(), 2000)
  }, [callInfo, setState, reset])

  return { accept, decline, hangup }
}
