"use client";

/**
 * AsteriskWebphone — UI only.
 * SIP UA lifecycle is managed by AsteriskSipProvider (always mounted in layout).
 * This component uses the module-level sipSession singleton for call operations.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { UserAgent, Inviter, SessionState } from "sip.js";
import type { Session, Web } from "sip.js";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isSipCallActive, useWebphoneStore } from "@/stores/webphone-store";
import { useAuthStore } from "@/stores/auth-store";
import { CallControls } from "./call-controls";
import { CallTimer } from "./call-timer";
import { Numpad } from "./numpad";
import { SipTransferPanel } from "./sip-transfer-panel";
import { SipConsultPanel } from "./sip-consult-panel";
import { AlertTriangle, Loader2, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { sipSession, SIP_MIC_TIMEOUT_ERROR } from "./sip-session";
import { createCallLog } from "@/services/call-logs";
import { describeRegisterFailure } from "@/lib/sip-diagnostics";
import type { SipLinkState } from "@/lib/sip-link";
import {
  attachSessionAudio,
  createOutgoingRingback,
  getSessionPeerConnection,
  isSipEarlyMediaEnabled,
  watchOutgoingInvite,
} from "@/lib/sip-ringback";
import type { OutgoingRingback } from "@/lib/sip-ringback";

const NO_RESPONSE_TIMEOUT_MS = 15_000;

interface AsteriskWebphoneProps {
  server: string;
  port?: number;
  username?: string;
  password?: string;
  initialPhoneNumber?: string;
  transport?: "ws" | "wss" | "udp";
}

export function AsteriskWebphone({ server, initialPhoneNumber = "", transport }: AsteriskWebphoneProps) {
  const {
    callStatus,
    callInfo,
    callDuration,
    setCallStatus,
    startCall,
    endCall,
    sipRegistered,
    isMuted,
    isOnHold,
    setOnHold,
    pendingSipCall,
    clearPendingSipCall,
  } = useWebphoneStore();
  const { user } = useAuthStore();
  const sipRegisterFailure = useWebphoneStore((s) => s.sipRegisterFailure);
  const sipLinkState = useWebphoneStore((s) => s.sipLinkState);

  const t = useTranslations("asteriskWebphone");
  const tc = useTranslations("webphoneControls");
  const td = useTranslations("sipDiagnostics");
  const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber);
  const [showKeypad, setShowKeypad] = useState(false);
  const [holdPending, setHoldPending] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferPending, setTransferPending] = useState(false);
  const [consult, setConsult] = useState<{
    state: "calling" | "established";
    ext: string;
    label: string;
  } | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const consultAudioRef = useRef<HTMLAudioElement | null>(null);
  // Quem encerrou a perna de consulta: "complete"/"cancel" iniciados por nós
  // (já tratam unhold/endCall); null = destino desligou → retomar a chamada.
  const consultEndRef = useRef<null | "complete" | "cancel">(null);
  // "Chamando" das ligações de saída (lib/sip-ringback.ts): a da ligação e a da consulta.
  const ringbackRef = useRef<OutgoingRingback | null>(null);
  const consultRingbackRef = useRef<OutgoingRingback | null>(null);
  const outgoingInviterRef = useRef<Inviter | null>(null);

  // Tela fechando no meio do "chamando": o toque de reserva não pode seguir tocando.
  useEffect(
    () => () => {
      ringbackRef.current?.stop();
      consultRingbackRef.current?.stop();
    },
    []
  );

  // Chamada recebida por cima do "chamando" (o provider troca a sessão e a ligação de saída fica
  // sem tela): o toque e o áudio antecipado dela não podem tocar por cima. Ligação já atendida
  // não entra aqui, para não cortar o áudio de uma conversa.
  useEffect(() => {
    if (callInfo?.direction !== "incoming") return;
    const outgoing = outgoingInviterRef.current;
    if (!outgoing || outgoing.state !== SessionState.Establishing) return;
    ringbackRef.current?.stop();
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  }, [callInfo]);

  const setupRemoteAudio = useCallback((session: Session) => {
    attachSessionAudio(session, remoteAudioRef.current);
  }, []);

  const handleSessionStateChange = useCallback(
    (state: SessionState) => {
      const remotePhone =
        callInfo?.phone ||
        (sipSession.session as unknown as { remoteIdentity?: { uri?: { user?: string } } })
          ?.remoteIdentity?.uri?.user ||
        "";
      switch (state) {
        case SessionState.Establishing:
          setCallStatus("calling");
          break;
        case SessionState.Established:
          setCallStatus("established");
          if (sipSession.session) setupRemoteAudio(sipSession.session);
 // Front legado: setupSession → Established → CriarCallLog('Completed')
          if (user && sipSession.sipUsername) {
            createCallLog({
              userId: user.userId,
              tenantId: user.tenantId,
              phoneNumber: sipSession.sipUsername,
              originNumber: sipSession.sipUsername,
              destinationNumber: remotePhone,
              callDuration: 0,
              callStatus: "Completed",
            }).catch(() => {});
          }
          break;
        case SessionState.Terminated:
 // Front legado: setupSession → Terminated → CriarCallLog('Ended', callDuration)
          if (user && sipSession.sipUsername) {
            createCallLog({
              userId: user.userId,
              tenantId: user.tenantId,
              phoneNumber: sipSession.sipUsername,
              originNumber: sipSession.sipUsername,
              destinationNumber: remotePhone,
              callDuration: callDuration,
              callStatus: "Ended",
            }).catch(() => {});
          }
          endCall();
          sipSession.session = null;
          break;
      }
    },
    [setCallStatus, endCall, setupRemoteAudio, callInfo?.phone, callDuration, user]
  );

  // Mute / unmute audio track
  useEffect(() => {
    if (!sipSession.session) return;
    const pc = (
      sipSession.session.sessionDescriptionHandler as unknown as Record<string, unknown>
    )?.peerConnection as RTCPeerConnection | undefined;
    if (!pc) return;
    for (const sender of pc.getSenders()) {
      if (sender.track?.kind === "audio") sender.track.enabled = !isMuted;
    }
  }, [isMuted]);

  // Hold / espera — re-INVITE com SDP sendonly. O Asterisk passa a tocar
  // música de espera ao contato; ao retomar, re-INVITE volta a sendrecv.
  const setHold = useCallback(
    (hold: boolean) => {
      const session = sipSession.session;
      if (!session || session.state !== SessionState.Established || holdPending) return;
      setHoldPending(true);
      // Tipo da plataforma web (tem `hold`); o sip.js encaminha ao SDH no re-INVITE.
      const sdhOptions: Web.SessionDescriptionHandlerOptions = { hold };
      const fail = () => {
        setHoldPending(false);
        toast.error(hold ? tc("holdError") : tc("resumeError"));
      };
      try {
        session
          .invite({
            sessionDescriptionHandlerOptions: sdhOptions,
            requestDelegate: {
              onAccept: () => {
                setOnHold(hold);
                setHoldPending(false);
              },
              onReject: fail,
            },
          })
          .catch(fail);
      } catch {
        fail();
      }
    },
    [holdPending, setOnHold, tc]
  );

  const handleToggleHold = useCallback(() => {
    setHold(!isOnHold);
  }, [isOnHold, setHold]);

  // Fecha o painel de transferência se a chamada deixar de estar conectada.
  useEffect(() => {
    if (callStatus !== "established") setTransferOpen(false);
  }, [callStatus]);

  const handleToggleTransfer = useCallback(() => {
    setTransferOpen((open) => !open);
  }, []);

  // Transferência Direta (blind / REFER) — envia REFER para o ramal/numero.
  // No 202 Accepted o PBX assume a perna; liberamos a UI (o BYE do Asterisk
  // ainda dispara Terminated → endCall, idempotente).
  const handleBlindTransfer = useCallback(
    (ext: string, label: string) => {
      const session = sipSession.session;
      const target = ext.trim();
      if (!session || session.state !== SessionState.Established || !target || transferPending) {
        return;
      }
      const uri = UserAgent.makeURI(`sip:${target}@${server}`);
      if (!uri) {
        toast.error(tc("transferError"));
        return;
      }
      setTransferPending(true);
      const fail = () => {
        setTransferPending(false);
        toast.error(tc("transferError"));
      };
      try {
        session
          .refer(uri, {
            requestDelegate: {
              onAccept: () => {
                setTransferPending(false);
                setTransferOpen(false);
                toast.success(tc("transferSuccess", { target: label }));
                endCall();
                sipSession.session = null;
              },
              onReject: fail,
            },
          })
          .catch(fail);
      } catch {
        fail();
      }
    },
    [server, transferPending, endCall, tc]
  );

  const resetConsult = useCallback(() => {
    setConsult(null);
    if (consultAudioRef.current) consultAudioRef.current.srcObject = null;
  }, []);

  // Transferência Consulta (attended): segura a chamada 1, liga ao destino
  // (chamada 2) para falar antes. Concluir → REFER/Replaces; Cancelar → derruba
  // a 2 e retoma a 1.
  const startConsultation = useCallback(
    (ext: string, label: string) => {
      const session1 = sipSession.session;
      const ua = sipSession.ua;
      const target = ext.trim();
      if (
        !session1 ||
        session1.state !== SessionState.Established ||
        !ua ||
        !target ||
        transferPending ||
        consult
      ) {
        return;
      }
      const uri = UserAgent.makeURI(`sip:${target}@${server}`);
      if (!uri) {
        toast.error(tc("consultStartError"));
        return;
      }
      setTransferPending(true);
      const fail = () => {
        setTransferPending(false);
        toast.error(tc("consultStartError"));
      };
      const holdOptions: Web.SessionDescriptionHandlerOptions = { hold: true };
      try {
        session1
          .invite({
            sessionDescriptionHandlerOptions: holdOptions,
            requestDelegate: {
              onAccept: () => {
                setOnHold(true);
                consultEndRef.current = null;
                try {
                  // earlyMedia: o "chamando" do destino toca antes de atender (lib/sip-ringback.ts).
                  const earlyMedia = isSipEarlyMediaEnabled();
                  const consultInviter = new Inviter(ua, uri, { earlyMedia });
                  sipSession.consultSession = consultInviter;
                  setConsult({ state: "calling", ext: target, label });
                  setTransferOpen(false);
                  consultRingbackRef.current?.stop();
                  const consultRingback = createOutgoingRingback({
                    session: consultInviter,
                    getPeerConnection: () => getSessionPeerConnection(consultInviter),
                    attachRemoteAudio: () => attachSessionAudio(consultInviter, consultAudioRef.current),
                  });
                  consultRingbackRef.current = consultRingback;
                  const consultWatch = watchOutgoingInvite(consultInviter, {
                    earlyMedia,
                    sawEarlyMedia: consultRingback.sawEarlyMedia,
                  });
                  consultInviter.stateChange.addListener((s: SessionState) => {
                    // Consulta encerrada e já substituída por outra: não mexe na nova.
                    if (sipSession.consultSession !== null && sipSession.consultSession !== consultInviter) return;
                    if (s === SessionState.Established) {
                      setConsult((c) => (c ? { ...c, state: "established" } : c));
                      attachSessionAudio(consultInviter, consultAudioRef.current);
                    } else if (s === SessionState.Terminated) {
                      sipSession.consultSession = null;
                      resetConsult();
                      // Destino desligou antes de concluirmos → retoma a chamada 1.
                      if (consultEndRef.current === null) setHold(false);
                    }
                  });
                  consultInviter
                    .invite({
                      requestDelegate: {
                        onProgress: (response) => consultRingback.onProgress(response),
                        onAccept: consultWatch.onAccept,
                        onReject: consultWatch.onFinalResponse,
                        onRedirect: consultWatch.onFinalResponse,
                      },
                    })
                    .catch(() => {
                      sipSession.consultSession = null;
                      resetConsult();
                      setHold(false);
                      toast.error(tc("consultStartError"));
                    });
                  setTransferPending(false);
                } catch {
                  setHold(false);
                  fail();
                }
              },
              onReject: fail,
            },
          })
          .catch(fail);
      } catch {
        fail();
      }
    },
    [server, transferPending, consult, setOnHold, setHold, resetConsult, tc]
  );

  const completeTransfer = useCallback(() => {
    const session1 = sipSession.session;
    const consultSession = sipSession.consultSession;
    if (
      !session1 ||
      !consultSession ||
      consultSession.state !== SessionState.Established ||
      transferPending
    ) {
      return;
    }
    setTransferPending(true);
    consultEndRef.current = "complete";
    const label = consult?.label ?? "";
    const fail = () => {
      setTransferPending(false);
      consultEndRef.current = null;
      toast.error(tc("transferError"));
    };
    try {
      // REFER w/Replaces: conecta contato ↔ destino; nossas duas pernas encerram.
      session1
        .refer(consultSession, {
          requestDelegate: {
            onAccept: () => {
              setTransferPending(false);
              toast.success(tc("transferSuccess", { target: label }));
              resetConsult();
              endCall();
              sipSession.session = null;
              sipSession.consultSession = null;
            },
            onReject: fail,
          },
        })
        .catch(fail);
    } catch {
      fail();
    }
  }, [transferPending, consult, endCall, resetConsult, tc]);

  const cancelConsultation = useCallback(() => {
    consultRingbackRef.current?.stop();
    const consultSession = sipSession.consultSession;
    consultEndRef.current = "cancel";
    if (consultSession) {
      try {
        if (consultSession.state === SessionState.Established) consultSession.bye();
        else if ("cancel" in consultSession) (consultSession as Inviter).cancel();
      } catch {
        /* ignore */
      }
    }
    sipSession.consultSession = null;
    resetConsult();
    setHold(false); // retoma a chamada original
  }, [resetConsult, setHold]);

  // Discagem real (Inviter + INVITE) — compartilhada entre o botão verde
  // (handleDial) e o pedido externo pendingSipCall (botão SIP do contato).
  const dialNumber = useCallback(
    (rawNumber: string, tag?: string) => {
      const number = rawNumber.trim();
      if (!number) return;
      if (!sipSession.ua) {
        toast.error(t("disconnectedWebphone"));
        return;
      }
      if (sipSession.session) {
        toast.error(t("callInProgress"));
        return;
      }
      const target = UserAgent.makeURI(`sip:${number}@${server}`);
      if (!target) {
        toast.error(t("callError"));
        return;
      }
      // earlyMedia: o "chamando" e os avisos da operadora tocam antes de atender (lib/sip-ringback.ts).
      const earlyMedia = isSipEarlyMediaEnabled();
      const inviter = new Inviter(sipSession.ua, target, { earlyMedia });
      sipSession.session = inviter;
      outgoingInviterRef.current = inviter;
      ringbackRef.current?.stop();
      const ringback = createOutgoingRingback({
        session: inviter,
        getPeerConnection: () => getSessionPeerConnection(inviter),
        attachRemoteAudio: () => attachSessionAudio(inviter, remoteAudioRef.current),
      });
      ringbackRef.current = ringback;
      const inviteWatch = watchOutgoingInvite(inviter, { earlyMedia, sawEarlyMedia: ringback.sawEarlyMedia });
      setPhoneNumber(number);
      startCall({ phone: number, tag, direction: "outgoing" });
 // Front legado: makeCall → CriarCallLog('Calling')
      if (user && sipSession.sipUsername) {
        createCallLog({
          userId: user.userId,
          tenantId: user.tenantId,
          phoneNumber: sipSession.sipUsername,
          originNumber: sipSession.sipUsername,
          destinationNumber: number,
          callDuration: null,
          callStatus: "Calling",
        }).catch(() => {});
      }
      // Provedor que não responde NADA ao INVITE (nem 100 Trying) — caso típico:
      // modo UDP com provedor sem WebRTC, onde o INVITE (~2 KB) se perde
      // fragmentado enquanto REGISTER/OPTIONS passam. Sem este teto a tela
      // ficava em "Chamando..." até o Timer B (32 s) derrubar em silêncio.
      let gotResponse = false;
      let noResponseTimedOut = false;
      let noResponseTimer: ReturnType<typeof setTimeout> | null = null;
      const markResponse = () => {
        gotResponse = true;
        if (noResponseTimer) clearTimeout(noResponseTimer);
      };
      inviter.stateChange.addListener((s: SessionState) => {
        if (s === SessionState.Terminated && noResponseTimer) clearTimeout(noResponseTimer);
        // Chamada já encerrada pelo teto: o Terminated tardio (Timer B) não pode
        // zerar sipSession.session de uma chamada NOVA feita nesse meio-tempo.
        if (noResponseTimedOut) return;
        // Mesma coisa quando outra ligação já ocupa a tela (rediscou antes do 487, ou
        // entrou chamada durante o "chamando"): esta não mexe no estado da outra.
        if (sipSession.session !== null && sipSession.session !== inviter) return;
        handleSessionStateChange(s);
      });
      // Rejeição aqui = INVITE nem saiu (ex.: microfone negado). Sem o reset,
      // o modal ficaria preso em "Chamando..." sem chamada real no fio.
      inviter
        .invite({
          requestDelegate: {
            onTrying: markResponse,
            onProgress: (response) => {
              markResponse();
              ringback.onProgress(response);
            },
            onRedirect: () => {
              markResponse();
              inviteWatch.onFinalResponse();
            },
            onAccept: () => {
              markResponse();
              inviteWatch.onAccept();
            },
            onReject: () => {
              markResponse();
              inviteWatch.onFinalResponse();
            },
          },
        })
        .then(() => {
          if (gotResponse || sipSession.session !== inviter) return;
          noResponseTimer = setTimeout(() => {
            if (gotResponse || sipSession.session !== inviter) return;
            if (inviter.state !== SessionState.Initial && inviter.state !== SessionState.Establishing) return;
            noResponseTimedOut = true;
            inviter.cancel().catch(() => {});
            endCall();
            sipSession.session = null;
            toast.error(t("noProviderResponse"));
          }, NO_RESPONSE_TIMEOUT_MS);
        })
        .catch((err: unknown) => {
          endCall();
          sipSession.session = null;
          toast.error(
            (err as { name?: string } | null)?.name === SIP_MIC_TIMEOUT_ERROR
              ? t("micTimeout")
              : t("callError")
          );
        });
    },
    [server, startCall, endCall, handleSessionStateChange, user, t]
  );

  const handleDial = useCallback(() => {
    dialNumber(phoneNumber);
  }, [dialNumber, phoneNumber]);

  // Consome o pedido de discagem vindo do botão SIP do contato. Consumo único
  // (limpa antes de discar) e nunca observa callInfo/callStatus — chamada
  // recebida jamais dispara discagem por aqui. Pedido velho (modal sem config
  // SIP na hora do clique) é descartado em vez de discar sozinho mais tarde.
  useEffect(() => {
    if (!pendingSipCall) return;
    clearPendingSipCall();
    if (Date.now() - pendingSipCall.requestedAt > 15000) return;
    dialNumber(pendingSipCall.phone, pendingSipCall.tag);
  }, [pendingSipCall, clearPendingSipCall, dialNumber]);

  const handleHangup = useCallback(() => {
    // O toque de reserva e o áudio antecipado da operadora param já no clique, sem esperar
    // o 487/BYE fechar a conexão (o 487 que se perde deixaria o áudio tocando com a tela parada).
    ringbackRef.current?.stop();
    consultRingbackRef.current?.stop();
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    // Derruba também qualquer perna de consulta em aberto.
    const consultSession = sipSession.consultSession;
    if (consultSession) {
      consultEndRef.current = "cancel";
      try {
        if (consultSession.state === SessionState.Established) consultSession.bye();
        else if ("cancel" in consultSession) (consultSession as Inviter).cancel();
      } catch {
        /* ignore */
      }
      sipSession.consultSession = null;
      resetConsult();
    }
    const session = sipSession.session;
    if (!session) { endCall(); return; }
    switch (session.state) {
      case SessionState.Initial:
      case SessionState.Establishing:
        if ("cancel" in session) (session as Inviter).cancel();
        else (session as Session & { reject: () => void }).reject?.();
        break;
      case SessionState.Established:
        session.bye();
        break;
    }
    endCall();
    sipSession.session = null;
  }, [endCall, resetConsult]);

  const handleAccept = useCallback(() => {
    const session = sipSession.session;
    if (!session) return;
    // accept() is only valid in Initial state — guard against double-clicks / re-renders
    if (session.state !== SessionState.Initial) return;
    if ("accept" in session) {
 // Front legado: acceptCall → CriarCallLog('Accepted')
      if (user && sipSession.sipUsername && callInfo?.phone) {
        createCallLog({
          userId: user.userId,
          tenantId: user.tenantId,
          phoneNumber: sipSession.sipUsername,
          originNumber: sipSession.sipUsername,
          destinationNumber: callInfo.phone,
          callDuration: null,
          callStatus: "Accepted",
        }).catch(() => {});
      }
      // Register state listener so Established → remote audio is wired up
      session.stateChange.addListener((s: SessionState) => handleSessionStateChange(s));
      (session as Session & { accept: () => Promise<void> })
        .accept()
        .catch(() => {});
    }
  }, [handleSessionStateChange, user, callInfo?.phone]);

  const handleReject = useCallback(() => {
    const session = sipSession.session;
    if (!session) return;
    if (session.state === SessionState.Initial && "reject" in session) {
      (session as Session & { reject: () => Promise<void> }).reject().catch(() => {});
    }
    endCall();
    sipSession.session = null;
  }, [endCall]);

  const handleKeypadPress = useCallback(
    (key: string) => {
      if (callStatus === "established") {
        const session = sipSession.session;
        if (session) {
          const pc = (
            session.sessionDescriptionHandler as unknown as Record<string, unknown>
          )?.peerConnection as RTCPeerConnection | undefined;
          if (pc) {
            const sender = pc.getSenders().find((s) => s.dtmf);
            sender?.dtmf?.insertDTMF(key, 100, 70);
          }
        }
      } else {
        setPhoneNumber((prev) => prev + key);
      }
    },
    [callStatus]
  );

  const statusLabel: Record<string, string> = {
    idle: t("statusIdle"),
    registering: t("statusRegistering"),
    registered: t("statusRegistered"),
    ringing: t("statusRinging"),
    calling: t("statusCalling"),
    established: t("statusEstablished"),
    terminated: t("statusTerminated"),
    error: t("statusError"),
  };
  // Fora de chamada o selo mostra a conexão do ramal; em chamada, a chamada.
  const linkLabel: Record<SipLinkState, string> = {
    idle: t("statusIdle"),
    connecting: t("statusConnecting"),
    registering: t("statusRegistering"),
    registered: t("statusRegistered"),
    reconnecting: t("statusReconnecting"),
    error: t("statusError"),
  };
  const inCall = isSipCallActive(callStatus);
  const linkBusy = sipLinkState === "connecting" || sipLinkState === "registering" || sipLinkState === "reconnecting";

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <audio ref={remoteAudioRef} autoPlay />
      <audio ref={consultAudioRef} autoPlay />

      <div className="flex items-center gap-2">
        {sipRegistered ? (
          <Wifi aria-hidden="true" className="h-4 w-4 text-success" />
        ) : linkBusy ? (
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-amber-500" />
        ) : (
          <WifiOff aria-hidden="true" className="h-4 w-4 text-destructive" />
        )}
        <Badge
          variant={
            isOnHold ? "warning" : sipRegistered ? "success" : sipLinkState === "reconnecting" ? "warning" : "secondary"
          }
        >
          {isOnHold
            ? tc("statusOnHold")
            : inCall
              ? statusLabel[callStatus] || callStatus
              : linkLabel[sipLinkState] || statusLabel[callStatus] || callStatus}
        </Badge>
      </div>

      {/* Queda da conexão: o WebPhone volta sozinho (lib/sip-link.ts); o botão só pula a espera. */}
      {sipLinkState === "reconnecting" && (
        <div
          role="status"
          className="flex w-full items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-medium break-words">
              {td(`webphone.${describeRegisterFailure(sipRegisterFailure ?? { kind: "disconnected" })}`, {
                code: sipRegisterFailure?.code ?? 0,
              })}
            </p>
            <p className="break-words opacity-90">{td("webphone.reconnectingHint")}</p>
            {/* Nunca conectou: pode ser configuração, então a dica do teste aparece junto. */}
            {sipRegisterFailure?.kind === "connection" && (
              <p className="break-words opacity-90">
                {td(transport === "udp" ? "webphone.adminHintUdp" : "webphone.adminHint")}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => sipSession.link?.reconnectNow()}
            >
              <RefreshCw aria-hidden="true" className="mr-1 h-3.5 w-3.5" />
              {td("webphone.reconnectNow")}
            </Button>
          </div>
        </div>
      )}

      {/* Só no erro definitivo: entre o socket voltar e o 200 chegar a falha anterior
          continua guardada, e a caixa vermelha mandaria recarregar a página à toa. */}
      {sipLinkState === "error" && sipRegisterFailure && (
        <div
          role="status"
          className="flex w-full items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0 space-y-0.5">
            <p className="font-medium break-words">
              {td(`webphone.${describeRegisterFailure(sipRegisterFailure)}`, {
                code: sipRegisterFailure.code ?? 0,
              })}
            </p>
            <p className="break-words opacity-90">
              {td(
                sipRegisterFailure.kind === "disconnected" || sipRegisterFailure.kind === "lost"
                  ? "webphone.reloadHint"
                  : transport === "udp"
                    ? "webphone.adminHintUdp"
                    : "webphone.adminHint"
              )}
            </p>
          </div>
        </div>
      )}

      {callInfo && (
        <div className="text-center">
          <p className="text-lg font-semibold">{callInfo.tag || callInfo.phone}</p>
          {callInfo.tag && (
            <p className="text-sm text-muted-foreground">{callInfo.phone}</p>
          )}
          <CallTimer />
        </div>
      )}

      {callStatus !== "established" && callStatus !== "ringing" && (
        <Input
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder={t("phoneNumberPlaceholder")}
          className="text-center text-lg"
          disabled={callStatus === "calling"}
        />
      )}

      {showKeypad && !consult && <Numpad onPress={handleKeypadPress} />}

      {/* Durante a consulta, escondemos os controles da chamada 1 (em espera) e
          mostramos só o painel de consulta (Concluir / Cancelar). */}
      {!consult && (
        <CallControls
          onDial={handleDial}
          onHangup={handleHangup}
          onAccept={handleAccept}
          onReject={handleReject}
          onToggleKeypad={() => setShowKeypad(!showKeypad)}
          onToggleHold={handleToggleHold}
          holdPending={holdPending}
          onTransfer={handleToggleTransfer}
        />
      )}

      {consult && (
        <SipConsultPanel
          contactLabel={callInfo?.tag || callInfo?.phone || ""}
          targetLabel={consult.label}
          state={consult.state}
          pending={transferPending}
          onComplete={completeTransfer}
          onCancel={cancelConsultation}
        />
      )}

      {!consult && transferOpen && callStatus === "established" && (
        <SipTransferPanel
          contactLabel={callInfo?.tag || callInfo?.phone || ""}
          transferPending={transferPending}
          onConfirmTransfer={handleBlindTransfer}
          onStartConsultation={startConsultation}
          onClose={() => setTransferOpen(false)}
        />
      )}
    </div>
  );
}
