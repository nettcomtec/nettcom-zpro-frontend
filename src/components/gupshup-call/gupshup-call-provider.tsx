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
  registerCallBusyProbe,
  decideIncomingWhatsappCall,
} from "@/lib/call-busy"
import {
  preAcceptGupshupCall,
  acceptGupshupCall,
  rejectGupshupCall,
  terminateGupshupCall,
  claimGupshupCall,
} from "@/services/gupshup-calls"

const RING_TIMEOUT_MS = 30_000
// Teto do estado "conectando": se o navegador nunca responde ao pedido de
// microfone, o estado ficava preso para sempre e o atendente parava de receber
// chamadas sem entender por quê. Limpeza LOCAL, sem avisar o provedor.
const PRE_ACCEPT_TIMEOUT_MS = 60_000
// Teto do getUserMedia/SDP: o pedido de microfone IGNORADO (nem permitir nem
// bloquear) deixa a promise pendente para sempre.
const MEDIA_TIMEOUT_MS = 15_000

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
  const callState = useGupshupCallStore((s) => s.state)
  const currentCallId = useGupshupCallStore((s) => s.callInfo?.callId)

  function clearRingTimeout() {
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current)
      ringTimeoutRef.current = null
    }
  }

  // Sonda de "ocupado" por injeção: o orquestrador (lib/call-busy.ts) não
  // importa store nenhum — cada família de chamada registra a própria.
  useEffect(
    () =>
      registerCallBusyProbe("gupshup", () => {
        const s = useGupshupCallStore.getState()
        return s.callInfo
          ? {
              state: s.state,
              callId: s.callInfo.callId,
              startedAt: s.callInfo.startedAt,
            }
          : null
      }),
    [],
  )

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
      // Chamada em curso fica INTOCADA. "duplicate" (retry de webhook ou
      // reemissão do mesmo callId no escalonamento) sai em silêncio, sem
      // reagendar timer nem tocar de novo; "busy" só avisa na tela — nada é
      // enviado ao provedor, senão a chamada cairia também para os colegas
      // livres, que continuam tocando.
      const decision = decideIncomingWhatsappCall(payload?.callId)
      if (decision === "duplicate") return
      if (decision === "busy") {
        try {
          toast.info(
            t("gupshupCallProvider.missedWhileBusy", {
              name: payload?.contactName || payload?.from || "",
            }),
          )
        } catch {
          // ignore
        }
        return
      }

      // O timer anterior vazava quando um incoming chegava com o store já
      // ocupado por outro episódio.
      clearRingTimeout()

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
    [setCall, setState, setClaimedByOther, reset, t],
  )

  const handleCallAnswer = useCallback(
    async (payload: { callId?: string; sdpAnswer: string }) => {
      const s = useGupshupCallStore.getState()
      // Sem chamada neste store, o answer é de outra pilha: a chamada de SAÍDA
      // de Gupshup vive no store e no RTC do WABA (ticket-detail.tsx), mas o
      // sdpAnswer volta no prefixo do BSP. Sem este return, o setRemoteAnswer
      // caía num PeerConnection vazio (que não lança, apenas ignora) e o store
      // ficava "active" com callInfo nulo.
      if (!s.callInfo) return
      // Só filtra quando os dois lados têm callId: o outbound grava callId
      // vazio, e um filtro cego travaria o store para sempre.
      if (
        s.callInfo?.callId &&
        payload?.callId &&
        s.callInfo.callId !== payload.callId
      ) {
        return
      }

      const rtc = getGupshupRtc()
      try {
        await rtc.setRemoteAnswer(payload.sdpAnswer)
      } catch {
        // Answer inválido: o PeerConnection ficou quebrado. Marcar "ativo" aqui
        // deixava o card sem áudio e sem saída. Limpeza LOCAL, sem avisar o
        // provedor.
        closeGupshupRtc()
        reset()
        return
      }
      setState("active")
    },
    [setState, reset],
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
        // REJECTED de OUTRA chamada não pode derrubar a que está em curso.
        // O filtro só vale com callId nos dois lados (ver handleCallAnswer).
        if (
          s.callInfo?.callId &&
          payload?.callId &&
          s.callInfo.callId !== payload.callId
        ) {
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
    (payload: { callId?: string; status?: string; duration?: number }) => {
      const callInfo = useGupshupCallStore.getState().callInfo
      // Encerramento de OUTRA chamada não derruba a que está em curso. Sem
      // callId nos dois lados o filtro não vale — este ramo é a única válvula
      // que destrava um store zumbi.
      if (
        callInfo?.callId &&
        payload?.callId &&
        callInfo.callId !== payload.callId
      ) {
        return
      }
      clearRingTimeout()
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

  // Watchdog do "conectando": sem ele, o estado não tem timeout nenhum e o
  // atendente ficava ocupado até o F5. Limpeza LOCAL, no molde do timeout do
  // toque — nunca chama o provedor.
  useEffect(() => {
    if (callState !== "pre_accepting") return
    const timer = setTimeout(() => {
      const s = useGupshupCallStore.getState()
      if (s.state === "pre_accepting" && s.callInfo?.callId === currentCallId) {
        closeGupshupRtc()
        reset()
      }
    }, PRE_ACCEPT_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [callState, currentCallId, reset])

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
        // O interceptor rejeita com o RESPONSE (lib/api.ts), não com o erro do
        // axios — ler só `err.response.status` nunca casava e todo 409 escapava.
        const e = err as {
          status?: number
          data?: { error?: string }
          response?: { status?: number; data?: { error?: string } }
        }
        const status = e?.status ?? e?.response?.status
        const code = e?.data?.error ?? e?.response?.data?.error

        if (status === 409) {
          try {
            toast.info(t("gupshupCallProvider.alreadyClaimed"))
          } catch {}
          setClaimedByOther(true)
          closeGupshupRtc()
          reset()
          return
        }

        // Rota/resolução inexistente = backend antigo (rollout fragmentado):
        // segue SEM claim, senão nenhuma chamada Gupshup pode ser atendida. Um
        // 404 COM código ERR_*_CALL_NOT_FOUND é backend NOVO dizendo que a linha
        // da chamada não existe — aí seguir sem claim colocaria dois atendentes
        // na mesma chamada. 5xx, timeout e rede continuam derrubando o accept.
        if (
          (status === 404 || status === 405 || status === 501) &&
          !String(code || "").includes("NOT_FOUND")
        ) {
          console.warn(
            "[gupshup] claim indisponivel no backend; seguindo sem claim",
          )
        } else {
          throw err
        }
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
      // Teto de 15s: o pedido de microfone IGNORADO pelo usuário deixa o
      // getUserMedia pendente para sempre e o card preso em "conectando".
      let mediaTimer: ReturnType<typeof setTimeout> | null = null
      const sdpAnswer = await Promise.race([
        rtc.createAnswerForOffer(callInfo.sdpOffer),
        new Promise<string>((_, rejectRace) => {
          mediaTimer = setTimeout(
            () => rejectRace(new Error("gupshup_media_timeout")),
            MEDIA_TIMEOUT_MS,
          )
        }),
      ]).finally(() => {
        if (mediaTimer) clearTimeout(mediaTimer)
      })
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
