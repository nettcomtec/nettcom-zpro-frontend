"use client"

import { useCallback, useEffect, useRef } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useDialog360CallStore } from "@/stores/dialog360-call-store"
import { useDialog360CallSocket } from "@/hooks/use-dialog360-call-socket"
import { Dialog360WebRTC } from "@/lib/dialog360-webrtc"
import { useAuthStore } from "@/stores/auth-store"
import { createCallLog } from "@/services/call-logs"
import { getSocket } from "@/lib/socket"
import {
  preAcceptDialog360Call,
  acceptDialog360Call,
  rejectDialog360Call,
  terminateDialog360Call,
  claimDialog360Call,
} from "@/services/dialog360-calls"

const RING_TIMEOUT_MS = 30_000

// Singleton por tab — partilhado entre provider e actions hook.
let _rtc: Dialog360WebRTC | null = null

export function getDialog360Rtc(): Dialog360WebRTC {
  if (!_rtc) _rtc = new Dialog360WebRTC()
  return _rtc
}

export function closeDialog360Rtc() {
  _rtc?.close()
  _rtc = null
}

function createDialog360CallLog(
  callInfo: { direction?: string; from?: string; to?: string } | null,
  callStatus: string,
  duration: number = 0,
) {
  const { user } = useAuthStore.getState()
  if (!user || !callInfo) return
  const isUserInitiated = callInfo.direction === "USER_INITIATED"
  const primary = (isUserInitiated ? callInfo.from : callInfo.to) ?? ""
  const secondary = (isUserInitiated ? callInfo.to : callInfo.from) ?? ""
  createCallLog({
    userId: user.userId,
    tenantId: user.tenantId,
    phoneNumber: primary,
    originNumber: primary,
    destinationNumber: secondary,
    callDuration: duration,
    callStatus,
  }).catch(() => {})
}

export function Dialog360CallProvider() {
  const { setCall, setState, setClaimedByOther, reset } =
    useDialog360CallStore()
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
        direction: "USER_INITIATED",
        sdpOffer: payload.sdpOffer,
        contactName: payload.contactName,
        contactPic: payload.contactPic,
        startedAt: Date.now(),
      })
      setClaimedByOther(false)
      setState("ringing")

      ringTimeoutRef.current = setTimeout(async () => {
        const s = useDialog360CallStore.getState()
        if (
          s.state === "ringing" &&
          s.callInfo?.callId === payload.callId
        ) {
          // Local cleanup. Não chamamos rejectDialog360Call aqui para não
          // terminar uma call já aceita por outro agente — o backend
          // gerencia rejection via webhook 360dialog.
          if (!s.claimedByOther) {
            createDialog360CallLog(s.callInfo, "Missed", 0)
          }
          closeDialog360Rtc()
          reset()
        }
      }, RING_TIMEOUT_MS)
    },
    [setCall, setState, setClaimedByOther, reset],
  )

  const handleCallAnswer = useCallback(
    async (payload: { sdpAnswer: string }) => {
      const rtc = getDialog360Rtc()
      await rtc.setRemoteAnswer(payload.sdpAnswer).catch(() => {})
      setState("active")
    },
    [setState],
  )

  const handleCallStatus = useCallback(
    (payload: { callId: string; status: string }) => {
      const s = useDialog360CallStore.getState()
      const isLocalRingingForCall =
        s.state === "ringing" && s.callInfo?.callId === payload.callId

      if (payload.status === "ACCEPTED") {
        if (isLocalRingingForCall) {
          clearRingTimeout()
          setClaimedByOther(true)
          try {
            toast.info(t("dialog360CallProvider.answeredByOther"))
          } catch {
            // ignore — chave i18n adicionada em wave 3
          }
          closeDialog360Rtc()
          reset()
          return
        }
        setState("active")
      } else if (payload.status === "REJECTED") {
        if (isLocalRingingForCall) {
          clearRingTimeout()
          setClaimedByOther(true)
          closeDialog360Rtc()
          reset()
          return
        }
        clearRingTimeout()
        closeDialog360Rtc()
        reset()
      }
    },
    [setState, setClaimedByOther, reset, t],
  )

  const handleCallClaimed = useCallback(
    (payload: { callId: string }) => {
      const s = useDialog360CallStore.getState()
      if (
        s.state === "ringing" &&
        s.callInfo?.callId === payload.callId
      ) {
        clearRingTimeout()
        setClaimedByOther(true)
        try {
          toast.info(t("dialog360CallProvider.answeredByOther"))
        } catch {
          // ignore
        }
        closeDialog360Rtc()
        reset()
      }
    },
    [setClaimedByOther, reset, t],
  )

  const handleCallTerminated = useCallback(
    (payload: { status?: string; duration?: number }) => {
      clearRingTimeout()
      const callInfo = useDialog360CallStore.getState().callInfo
      createDialog360CallLog(
        callInfo,
        payload.status === "Completed" ? "Completed" : "Ended",
        payload.duration || 0,
      )
      closeDialog360Rtc()
      setState("ended")
      setTimeout(() => reset(), 2000)
    },
    [setState, reset],
  )

  useDialog360CallSocket({
    onIncomingCall: handleIncoming,
    onCallAnswer: handleCallAnswer,
    onCallStatus: handleCallStatus,
    onCallTerminated: handleCallTerminated,
    onCallClaimed: handleCallClaimed,
  })

  useEffect(() => {
    return () => {
      clearRingTimeout()
      closeDialog360Rtc()
    }
  }, [])

  return null
}

// Hook para componentes de UI acionarem accept / decline / hangup.
export function useDialog360CallActions() {
  const { callInfo, setState, setClaimedByOther, reset } =
    useDialog360CallStore()
  const t = useTranslations()

  const accept = useCallback(async () => {
    if (!callInfo?.sdpOffer || callInfo.channelId == null) return
    setState("pre_accepting")
    try {
      // Server-side atomic claim antes de qualquer chamada à 360dialog.
      try {
        await claimDialog360Call({ callId: callInfo.callId })
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response
          ?.status
        if (status === 409) {
          try {
            toast.info(t("dialog360CallProvider.alreadyClaimed"))
          } catch {
            // ignore
          }
          setClaimedByOther(true)
          closeDialog360Rtc()
          reset()
          return
        }
        throw err
      }

      // Optimistic broadcast — peer tabs silenciam o ringtone imediatamente.
      try {
        const userId = useAuthStore.getState().user?.userId
        const tenantId = useAuthStore.getState().user?.tenantId
        if (tenantId) {
          getSocket().emit(`${tenantId}:dialog360:call:claimed`, {
            callId: callInfo.callId,
            userId,
          })
        }
      } catch {
        // ignore
      }

      const rtc = getDialog360Rtc()
      const sdpAnswer = await rtc.createAnswerForOffer(callInfo.sdpOffer)
      await preAcceptDialog360Call({
        whatsappId: callInfo.channelId,
        callId: callInfo.callId,
        sdpAnswer,
      })
      await acceptDialog360Call({
        whatsappId: callInfo.channelId,
        callId: callInfo.callId,
        sdpAnswer,
      })
      setState("active")
    } catch {
      closeDialog360Rtc()
      reset()
    }
  }, [callInfo, setState, setClaimedByOther, reset, t])

  const decline = useCallback(async () => {
    if (!callInfo || callInfo.channelId == null) return
    const claimedByOther = useDialog360CallStore.getState().claimedByOther
    if (claimedByOther) {
      closeDialog360Rtc()
      reset()
      return
    }
    await rejectDialog360Call({
      whatsappId: callInfo.channelId,
      callId: callInfo.callId,
    }).catch(() => {})
    createDialog360CallLog(callInfo, "Missed", 0)
    closeDialog360Rtc()
    reset()
  }, [callInfo, reset])

  const hangup = useCallback(async () => {
    if (!callInfo || callInfo.channelId == null) return
    const claimedByOther = useDialog360CallStore.getState().claimedByOther
    if (claimedByOther) {
      closeDialog360Rtc()
      reset()
      return
    }
    await terminateDialog360Call({
      whatsappId: callInfo.channelId,
      callId: callInfo.callId,
    }).catch(() => {})
    createDialog360CallLog(
      callInfo,
      "Ended",
      useDialog360CallStore.getState().duration,
    )
    closeDialog360Rtc()
    setState("ended")
    setTimeout(() => reset(), 2000)
  }, [callInfo, setState, reset])

  return { accept, decline, hangup }
}
