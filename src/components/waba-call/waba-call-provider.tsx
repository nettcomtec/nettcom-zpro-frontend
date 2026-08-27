"use client"

import { useCallback, useEffect, useRef } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useWabaCallStore } from "@/stores/waba-call-store"
import { useWabaCallSocket } from "@/hooks/use-waba-call-socket"
import { WabaWebRTC } from "@/lib/waba-webrtc"
import { useAuthStore } from "@/stores/auth-store"
import { createCallLog } from "@/services/call-logs"
import { getSocket } from "@/lib/socket"
import {
  preAcceptWabaCall,
  acceptWabaCall,
  rejectWabaCall,
  terminateWabaCall,
  claimWabaCall
} from "@/services/waba-calls"
import { useChannelCaller } from "@/hooks/use-channel-caller"

const RING_TIMEOUT_MS = 30_000

// Singleton por tab — partilhado entre provider e actions hook
let _rtc: WabaWebRTC | null = null

export function getWabaRtc(): WabaWebRTC {
  if (!_rtc) _rtc = new WabaWebRTC()
  return _rtc
}

export function closeWabaRtc() {
  _rtc?.close()
  _rtc = null
}

function createWabaCallLog(callInfo: any, callStatus: string, duration: number = 0) {
  const { user } = useAuthStore.getState()
  if (!user || !callInfo) return
  createCallLog({
    userId: user.userId,
    tenantId: user.tenantId,
    phoneNumber: callInfo.direction === 'USER_INITIATED' ? callInfo.from : callInfo.to,
    originNumber: callInfo.direction === 'USER_INITIATED' ? callInfo.from : callInfo.to,
    destinationNumber: callInfo.direction === 'USER_INITIATED' ? callInfo.to : callInfo.from,
    callDuration: duration,
    callStatus
  }).catch(() => {})
}

export function WabaCallProvider() {
  const { setCall, setState, setClaimedByOther, reset } = useWabaCallStore()
  const t = useTranslations()
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearRingTimeout() {
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current)
      ringTimeoutRef.current = null
    }
  }

  const handleIncoming = useCallback((payload: any) => {
    setCall({
      callId: payload.callId,
      from: payload.from,
      to: payload.to,
      phoneNumberId: payload.phoneNumberId,
      channelId: payload.channelId,
      direction: 'USER_INITIATED',
      sdpOffer: payload.sdpOffer,
      contactName: payload.contactName,
      contactPic: payload.contactPic,
      startedAt: Date.now()
    })
    setClaimedByOther(false)
    setState('ringing')

    ringTimeoutRef.current = setTimeout(async () => {
      const s = useWabaCallStore.getState()
      if (s.state === 'ringing' && s.callInfo?.callId === payload.callId) {
        // Local-only cleanup. Calling rejectWabaCall here would terminate a call
        // already accepted by another agent (Layer 1 fix); instead we trust the
        // server (claim row + Meta status webhook) to drive rejection logic.
        if (!s.claimedByOther) {
          createWabaCallLog(s.callInfo, 'Missed', 0)
        }
        closeWabaRtc()
        reset()
      }
    }, RING_TIMEOUT_MS)
  }, [setCall, setState, setClaimedByOther, reset])

  const handleCallAnswer = useCallback(async (payload: any) => {
    const rtc = getWabaRtc()
    await rtc.setRemoteAnswer(payload.sdpAnswer).catch(() => {})
    setState('active')
  }, [setState])

  const handleCallStatus = useCallback((payload: any) => {
    const s = useWabaCallStore.getState()
    const isLocalRingingForCall = s.state === 'ringing' && s.callInfo?.callId === payload.callId

    if (payload.status === 'ACCEPTED') {
      if (isLocalRingingForCall) {
        // Another tab/agent answered first. Silent local cleanup, no Meta call.
        clearRingTimeout()
        setClaimedByOther(true)
        try { toast.info(t('wabaCallProvider.answeredByOther')) } catch {}
        closeWabaRtc()
        reset()
        return
      }
      setState('active')
    } else if (payload.status === 'REJECTED') {
      if (isLocalRingingForCall) {
        clearRingTimeout()
        setClaimedByOther(true)
        closeWabaRtc()
        reset()
        return
      }
      clearRingTimeout()
      closeWabaRtc()
      reset()
    }
  }, [setState, setClaimedByOther, reset, t])

  const handleCallClaimed = useCallback((payload: any) => {
    const s = useWabaCallStore.getState()
    if (s.state === 'ringing' && s.callInfo?.callId === payload.callId) {
      clearRingTimeout()
      setClaimedByOther(true)
      try { toast.info(t('wabaCallProvider.answeredByOther')) } catch {}
      closeWabaRtc()
      reset()
    }
  }, [setClaimedByOther, reset, t])

  const handleCallTerminated = useCallback((payload: any) => {
    clearRingTimeout()
    const callInfo = useWabaCallStore.getState().callInfo
    createWabaCallLog(callInfo, payload.status === 'Completed' ? 'Completed' : 'Ended', payload.duration || 0)
    closeWabaRtc()
    setState('ended')
    setTimeout(() => reset(), 2000)
  }, [setState, reset])

  useWabaCallSocket({
    onIncomingCall: handleIncoming,
    onCallAnswer: handleCallAnswer,
    onCallStatus: handleCallStatus,
    onCallTerminated: handleCallTerminated,
    onCallClaimed: handleCallClaimed
  })

  useEffect(() => {
    return () => {
      clearRingTimeout()
      closeWabaRtc()
    }
  }, [])

  return null
}

// Hook para os componentes de UI acionarem accept / decline / hangup
export function useWabaCallActions() {
  const { callInfo, setState, setClaimedByOther, reset } = useWabaCallStore()
  const t = useTranslations()

  const accept = useCallback(async () => {
    if (!callInfo?.sdpOffer || callInfo.channelId == null) return
    setState('pre_accepting')
    try {
      // Layer 2: server-side atomic claim BEFORE any Meta call.
      try {
        await claimWabaCall({ callId: callInfo.callId })
      } catch (err: any) {
        const status = err?.response?.status
        if (status === 409) {
          try { toast.info(t('wabaCallProvider.alreadyClaimed')) } catch {}
          setClaimedByOther(true)
          closeWabaRtc()
          reset()
          return
        }
        throw err
      }

      // Optimistic broadcast — peer tabs silence their ringtone immediately.
      try {
        const userId = useAuthStore.getState().user?.userId
        const tenantId = useAuthStore.getState().user?.tenantId
        if (tenantId) {
          getSocket().emit(`${tenantId}:waba:call:claimed`, { callId: callInfo.callId, userId })
        }
      } catch {}

      const rtc = getWabaRtc()
      const sdpAnswer = await rtc.createAnswerForOffer(callInfo.sdpOffer)
      const caller = useChannelCaller(callInfo.channel)
      await caller.preAccept({ whatsappId: callInfo.channelId, callId: callInfo.callId, sdpAnswer })
      await caller.accept({ whatsappId: callInfo.channelId, callId: callInfo.callId, sdpAnswer })
      setState('active')
    } catch {
      closeWabaRtc()
      reset()
    }
  }, [callInfo, setState, setClaimedByOther, reset, t])

  const decline = useCallback(async () => {
    if (!callInfo || callInfo.channelId == null) return
    const claimedByOther = useWabaCallStore.getState().claimedByOther
    if (claimedByOther) {
      // Already terminated/answered elsewhere — local cleanup only, no Meta call.
      closeWabaRtc()
      reset()
      return
    }
    const caller = useChannelCaller(callInfo.channel)
    await caller.reject({ whatsappId: callInfo.channelId, callId: callInfo.callId }).catch(() => {})
    createWabaCallLog(callInfo, 'Missed', 0)
    closeWabaRtc()
    reset()
  }, [callInfo, reset])

  const hangup = useCallback(async () => {
    if (!callInfo || callInfo.channelId == null) return
    const claimedByOther = useWabaCallStore.getState().claimedByOther
    if (claimedByOther) {
      closeWabaRtc()
      reset()
      return
    }
    const caller = useChannelCaller(callInfo.channel)
    await caller.terminate({ whatsappId: callInfo.channelId, callId: callInfo.callId }).catch(() => {})
    createWabaCallLog(callInfo, 'Ended', useWabaCallStore.getState().duration)
    closeWabaRtc()
    setState('ended')
    setTimeout(() => reset(), 2000)
  }, [callInfo, setState, reset])

  return { accept, decline, hangup }
}
