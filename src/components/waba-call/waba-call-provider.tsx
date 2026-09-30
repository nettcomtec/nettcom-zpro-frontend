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
import {
  registerCallBusyProbe,
  decideIncomingWhatsappCall
} from "@/lib/call-busy"

const RING_TIMEOUT_MS = 30_000
// Watchdog do pre_accepting: o estado nao tinha teto nenhum. Ver o useEffect.
const PRE_ACCEPTING_TIMEOUT_MS = 60_000
// Teto do getUserMedia (ver withMediaTimeout).
const MEDIA_TIMEOUT_MS = 15_000

// O getUserMedia fica PENDENTE para sempre quando o usuario apenas IGNORA o
// pedido de microfone do navegador (nem permite, nem nega) — sem este teto o
// atendente ficaria preso em pre_accepting ate dar F5, e o guard de ocupado o
// deixaria sem receber chamada nenhuma. O race mora aqui de proposito:
// lib/waba-webrtc.ts e compartilhada com os outros canais e nao e alterada.
function withMediaTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<never>((_, rejectMedia) => {
    timer = setTimeout(
      () => rejectMedia(new Error("waba_media_timeout")),
      MEDIA_TIMEOUT_MS
    )
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

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
  const { state, callInfo, setCall, setState, setClaimedByOther, reset } = useWabaCallStore()
  const t = useTranslations()
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearRingTimeout() {
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current)
      ringTimeoutRef.current = null
    }
  }

  // Sonda de "atendente ocupado" (lib/call-busy.ts). Registry por injecao: aquele
  // modulo nao importa store nenhum, cada provider publica o proprio estado. O
  // retorno do register ja e a funcao de remocao (formato do cleanup).
  useEffect(
    () =>
      registerCallBusyProbe("waba", () => {
        const s = useWabaCallStore.getState()
        return s.callInfo
          ? {
              state: s.state,
              callId: s.callInfo.callId,
              startedAt: s.callInfo.startedAt
            }
          : null
      }),
    []
  )

  const handleIncoming = useCallback((payload: any) => {
    // Chamada recebida durante um atendimento: a chamada em curso fica INTOCADA
    // e nada e enviado a Meta. Em broadcast (default), a 2a chamada toca para
    // todos — um reject daqui derrubaria a chamada tambem para os colegas livres,
    // que ainda podem atender.
    const decision = decideIncomingWhatsappCall(payload?.callId)
    if (decision === "duplicate") return
    if (decision === "busy") {
      try {
        toast.info(
          t('wabaCallProvider.missedWhileBusy', {
            name: payload?.contactName || payload?.from || ''
          })
        )
      } catch {}
      return
    }

    setCall({
      callId: payload.callId,
      from: payload.from,
      to: payload.to,
      phoneNumberId: payload.phoneNumberId,
      channelId: payload.channelId,
      channel: 'waba',
      direction: 'USER_INITIATED',
      sdpOffer: payload.sdpOffer,
      contactName: payload.contactName,
      contactPic: payload.contactPic,
      startedAt: Date.now()
    })
    setClaimedByOther(false)
    setState('ringing')

    // Timer anterior vazava: sem o clear, o timeout da chamada antiga continuava
    // vivo e derrubava a nova ao disparar.
    clearRingTimeout()
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
  }, [setCall, setState, setClaimedByOther, reset, t])

  const handleCallAnswer = useCallback(async (payload: any) => {
    const current = useWabaCallStore.getState().callInfo
    // Filtro so quando o store TEM id: o outbound grava callId vazio quando o
    // provedor devolve outro shape, e filtrar ai travaria o store para sempre.
    //
    // E o filtro NAO vale para chamada de SAIDA (BUSINESS_INITIATED): so existe
    // uma por aba (o botao Ligar agora recusa iniciar outra durante uma chamada)
    // e o answer so chega para ela. O id gravado no inicio vem da resposta do
    // provedor (`calls[0].id` na Meta, `messages[0].id` no Gupshup) e nao ha
    // garantia de que seja byte a byte o `call.id` que volta no webhook —
    // filtrar aqui arriscaria descartar o answer e deixar a ligacao muda.
    const isOutbound = current?.direction === 'BUSINESS_INITIATED'
    if (!isOutbound && current?.callId && payload?.callId !== current.callId) return

    const rtc = getWabaRtc()
    try {
      await rtc.setRemoteAnswer(payload.sdpAnswer)
    } catch {
      // O .catch(() => {}) antigo engolia a falha e marcava "ativo" com o
      // PeerConnection quebrado (card em chamada, audio mudo). Limpeza LOCAL,
      // sem chamar a Meta.
      closeWabaRtc()
      reset()
      return
    }
    setState('active')
  }, [setState, reset])

  const handleCallStatus = useCallback((payload: any) => {
    const s = useWabaCallStore.getState()
    const isLocalRingingForCall = s.state === 'ringing' && s.callInfo?.callId === payload.callId
    // Mesmo filtro por callId dos demais handlers, para o status de uma 2a
    // chamada nao derrubar a que esta em atendimento. O ramo isLocalRingingForCall
    // ja compara o id sozinho.
    const isForCurrentCall = !s.callInfo?.callId || s.callInfo.callId === payload?.callId

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
      if (!isForCurrentCall) return
      setState('active')
    } else if (payload.status === 'REJECTED') {
      if (isLocalRingingForCall) {
        clearRingTimeout()
        setClaimedByOther(true)
        closeWabaRtc()
        reset()
        return
      }
      if (!isForCurrentCall) return
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
    const callInfo = useWabaCallStore.getState().callInfo
    // Sem este filtro, o terminate da 2a chamada encerrava a que estava em
    // atendimento (era o report do Pedro). So filtra com id no store.
    if (callInfo?.callId && payload?.callId !== callInfo.callId) return

    clearRingTimeout()
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

  // Watchdog do pre_accepting: unico estado sem teto de tempo. Se o claim, o
  // microfone ou o pre_accept nunca resolverem, o card ficava em "Conectando..."
  // para sempre e o guard de ocupado silenciaria toda chamada seguinte. Limpeza
  // LOCAL (mesmo molde do timeout de ringing) — nunca chamar a Meta daqui: a
  // chamada pode ja ter sido atendida por outro atendente.
  useEffect(() => {
    if (state !== 'pre_accepting') return
    const watchedCallId = callInfo?.callId
    const timer = setTimeout(() => {
      const s = useWabaCallStore.getState()
      if (s.state === 'pre_accepting' && s.callInfo?.callId === watchedCallId) {
        closeWabaRtc()
        reset()
      }
    }, PRE_ACCEPTING_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [state, callInfo?.callId, reset])

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
        // O interceptor rejeita com o RESPONSE, nao com o erro do axios
        // (lib/api.ts: `Promise.reject(error.response || error)`) — err.response
        // e undefined e o teste antigo por err.response.status NUNCA executou,
        // ou seja: todo 409 caia no throw e virava teardown mudo.
        const status = err?.status ?? err?.response?.status
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
      const sdpAnswer = await withMediaTimeout(rtc.createAnswerForOffer(callInfo.sdpOffer))
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
