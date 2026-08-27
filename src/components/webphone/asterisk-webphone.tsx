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
import { useWebphoneStore } from "@/stores/webphone-store";
import { useAuthStore } from "@/stores/auth-store";
import { CallControls } from "./call-controls";
import { CallTimer } from "./call-timer";
import { Numpad } from "./numpad";
import { SipTransferPanel } from "./sip-transfer-panel";
import { SipConsultPanel } from "./sip-consult-panel";
import { Wifi, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { sipSession } from "./sip-session";
import { createCallLog } from "@/services/call-logs";

interface AsteriskWebphoneProps {
  server: string;
  port?: number;
  username?: string;
  password?: string;
  initialPhoneNumber?: string;
  transport?: "ws" | "wss" | "udp";
}

export function AsteriskWebphone({ server, initialPhoneNumber = "" }: AsteriskWebphoneProps) {
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
  } = useWebphoneStore();
  const { user } = useAuthStore();

  const t = useTranslations("asteriskWebphone");
  const tc = useTranslations("webphoneControls");
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

  const setupRemoteAudio = useCallback((session: Session) => {
    const pc = (
      session.sessionDescriptionHandler as unknown as Record<string, unknown>
    )?.peerConnection as RTCPeerConnection | undefined;
    if (!pc || !remoteAudioRef.current) return;
    const receivers = pc.getReceivers();
    if (receivers.length > 0 && receivers[0].track) {
      const stream = new MediaStream([receivers[0].track]);
      remoteAudioRef.current.srcObject = stream;
    }
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
          // Vue: setupSession → Established → CriarCallLog('Completed')
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
          // Vue: setupSession → Terminated → CriarCallLog('Ended', callDuration)
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
                  const consultInviter = new Inviter(ua, uri);
                  sipSession.consultSession = consultInviter;
                  setConsult({ state: "calling", ext: target, label });
                  setTransferOpen(false);
                  consultInviter.stateChange.addListener((s: SessionState) => {
                    if (s === SessionState.Established) {
                      setConsult((c) => (c ? { ...c, state: "established" } : c));
                      const pc = (
                        consultInviter.sessionDescriptionHandler as unknown as Record<string, unknown>
                      )?.peerConnection as RTCPeerConnection | undefined;
                      const receivers = pc?.getReceivers?.();
                      if (receivers && receivers[0]?.track && consultAudioRef.current) {
                        consultAudioRef.current.srcObject = new MediaStream([receivers[0].track]);
                      }
                    } else if (s === SessionState.Terminated) {
                      sipSession.consultSession = null;
                      resetConsult();
                      // Destino desligou antes de concluirmos → retoma a chamada 1.
                      if (consultEndRef.current === null) setHold(false);
                    }
                  });
                  consultInviter.invite().catch(() => {
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

  const handleDial = useCallback(() => {
    if (!sipSession.ua || !phoneNumber.trim()) return;
    const target = UserAgent.makeURI(`sip:${phoneNumber}@${server}`);
    if (!target) return;
    const inviter = new Inviter(sipSession.ua, target);
    sipSession.session = inviter;
    startCall({ phone: phoneNumber, direction: "outgoing" });
    // Vue: makeCall → CriarCallLog('Calling')
    if (user && sipSession.sipUsername) {
      createCallLog({
        userId: user.userId,
        tenantId: user.tenantId,
        phoneNumber: sipSession.sipUsername,
        originNumber: sipSession.sipUsername,
        destinationNumber: phoneNumber,
        callDuration: null,
        callStatus: "Calling",
      }).catch(() => {});
    }
    inviter.stateChange.addListener((s: SessionState) =>
      handleSessionStateChange(s)
    );
    inviter.invite();
  }, [phoneNumber, server, startCall, handleSessionStateChange, user]);

  const handleHangup = useCallback(() => {
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
      // Vue: acceptCall → CriarCallLog('Accepted')
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

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <audio ref={remoteAudioRef} autoPlay />
      <audio ref={consultAudioRef} autoPlay />

      <div className="flex items-center gap-2">
        {sipRegistered ? (
          <Wifi aria-hidden="true" className="h-4 w-4 text-success" />
        ) : (
          <WifiOff aria-hidden="true" className="h-4 w-4 text-destructive" />
        )}
        <Badge variant={isOnHold ? "warning" : sipRegistered ? "success" : "secondary"}>
          {isOnHold ? tc("statusOnHold") : statusLabel[callStatus] || callStatus}
        </Badge>
      </div>

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
