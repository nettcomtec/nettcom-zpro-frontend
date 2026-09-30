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
  registerCallBusyProbe,
  decideIncomingWhatsappCall,
} from "@/lib/call-busy"
import {
  preAcceptDialog360Call,
  acceptDialog360Call,
  rejectDialog360Call,
  terminateDialog360Call,
  claimDialog360Call,
} from "@/services/dialog360-calls"

const RING_TIMEOUT_MS = 30_000
// Teto do estado "conectando": se o navegador nunca responde ao pedido de
// microfone, o estado ficava preso para sempre e o atendente parava de receber
// chamadas sem entender por quê. Limpeza LOCAL, sem avisar o provedor.
const PRE_ACCEPT_TIMEOUT_MS = 60_000
// Teto do getUserMedia/SDP: o pedido de microfone IGNORADO (nem permitir nem
// bloquear) deixa a promise pendente para sempre.
const MEDIA_TIMEOUT_MS = 15_000

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
  const callState = useDialog360CallStore((s) => s.state)
  const currentCallId = useDialog360CallStore((s) => s.callInfo?.callId)

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
      registerCallBusyProbe("dialog360", () => {
        const s = useDialog360CallStore.getState()
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
            t("dialog360CallProvider.missedWhileBusy", {
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
    [setCall, setState, setClaimedByOther, reset, t],
  )

  const handleCallAnswer = useCallback(
    async (payload: { callId?: string; sdpAnswer: string }) => {
      const s = useDialog360CallStore.getState()
      // Sem chamada neste store, o answer é de outra pilha: a chamada de SAÍDA
      // de Dialog360 vive no store e no RTC do WABA (ticket-detail.tsx), mas o
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

      const rtc = getDialog360Rtc()
      try {
        await rtc.setRemoteAnswer(payload.sdpAnswer)
      } catch {
        // Answer inválido: o PeerConnection ficou quebrado. Marcar "ativo" aqui
        // deixava o card sem áudio e sem saída. Limpeza LOCAL, sem avisar o
        // provedor.
        closeDialog360Rtc()
        reset()
        return
      }
      setState("active")
    },
    [setState, reset],
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
    (payload: { callId?: string; status?: string; duration?: number }) => {
      const callInfo = useDialog360CallStore.getState().callInfo
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

  // Watchdog do "conectando": sem ele, o estado não tem timeout nenhum e o
  // atendente ficava ocupado até o F5. Limpeza LOCAL, no molde do timeout do
  // toque — nunca chama o provedor.
  useEffect(() => {
    if (callState !== "pre_accepting") return
    const timer = setTimeout(() => {
      const s = useDialog360CallStore.getState()
      if (s.state === "pre_accepting" && s.callInfo?.callId === currentCallId) {
        closeDialog360Rtc()
        reset()
      }
    }, PRE_ACCEPT_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [callState, currentCallId, reset])

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
            toast.info(t("dialog360CallProvider.alreadyClaimed"))
          } catch {
            // ignore
          }
          setClaimedByOther(true)
          closeDialog360Rtc()
          reset()
          return
        }

        // Rota inexistente = backend antigo (rollout fragmentado): segue SEM
        // claim, senão nenhuma chamada Dialog360 pode ser atendida. Um 404 COM
        // código ERR_*_CALL_NOT_FOUND é backend NOVO dizendo que a linha da
        // chamada não existe — aí seguir sem claim colocaria dois atendentes na
        // mesma chamada. 5xx, timeout e rede continuam derrubando o accept.
        if (
          (status === 404 || status === 405 || status === 501) &&
          !String(code || "").includes("NOT_FOUND")
        ) {
          console.warn(
            "[dialog360] claim indisponivel no backend; seguindo sem claim",
          )
        } else {
          throw err
        }
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
      // Teto de 15s: o pedido de microfone IGNORADO pelo usuário deixa o
      // getUserMedia pendente para sempre e o card preso em "conectando".
      let mediaTimer: ReturnType<typeof setTimeout> | null = null
      const sdpAnswer = await Promise.race([
        rtc.createAnswerForOffer(callInfo.sdpOffer),
        new Promise<string>((_, rejectRace) => {
          mediaTimer = setTimeout(
            () => rejectRace(new Error("dialog360_media_timeout")),
            MEDIA_TIMEOUT_MS,
          )
        }),
      ]).finally(() => {
        if (mediaTimer) clearTimeout(mediaTimer)
      })
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
