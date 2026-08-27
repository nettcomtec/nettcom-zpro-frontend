"use client";

/**
 * AsteriskSipProvider — background SIP UA manager.
 * Always mounted in the dashboard layout when sipEnabled, mirroring Vue's
 * AsteriskWebphone in MainLayout (always mounted, visually hidden).
 *
 * Registers on page load so incoming calls arrive even before the modal opens.
 * On incoming call: calls startCall() which sets isVisible=true → modal opens.
 */

import { useEffect } from "react";
import { UserAgent, Registerer, SessionState } from "sip.js";
import { useAuthStore } from "@/stores/auth-store";
import { useWebphoneStore } from "@/stores/webphone-store";
import { sipSession } from "./sip-session";
import { createCallLog } from "@/services/call-logs";

export function AsteriskSipProvider() {
  const { user } = useAuthStore();
  const { startCall, setCallStatus, setSipRegistered, endCall } = useWebphoneStore();
  const callStatus = useWebphoneStore((s) => s.callStatus);
  const incomingDirection = useWebphoneStore((s) => s.callInfo?.direction);

  const cfg = user?.sipConfig;

  // Beep enquanto há chamada SIP recebida tocando — mesmo padrão usado em
  // private-call-incoming-modal e waba-incoming-call-modal (Web Audio API).
  useEffect(() => {
    if (callStatus !== "ringing" || incomingDirection !== "incoming") return;
    const AudioCtx: typeof AudioContext | undefined =
      typeof window !== "undefined"
        ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    let stopped = false;

    const beep = () => {
      if (stopped) return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 480;
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.6);
      } catch { /* ignore */ }
      setTimeout(() => { if (!stopped) beep(); }, 1800);
    };
    beep();

    return () => {
      stopped = true;
      try { ctx.close(); } catch { /* ignore */ }
    };
  }, [callStatus, incomingDirection]);

  useEffect(() => {
    if (!cfg?.server || !cfg?.username || !cfg?.password) return;

    let destroyed = false;

    const uri = UserAgent.makeURI(`sip:${cfg.username}@${cfg.server}`);
    if (!uri) return;

    // setTimeout(0) — defer so React StrictMode's synchronous fake-unmount fires
    // clearTimeout before any WebSocket is opened. Mirrors Vue's single mounted() call.
    const timerId = setTimeout(async () => {
      if (destroyed) return;

      const transport = (cfg.transport ?? "wss") as "wss" | "ws" | "udp";
      let serverUrl: string;
      if (transport === "udp") {
        const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? window.location.origin;
        const apiHost = new URL(apiOrigin).host;
        let token = "";
        try {
          const raw = localStorage.getItem("token");
          token = raw ? (JSON.parse(raw) as string) : "";
        } catch { /* ignore */ }
        serverUrl =
          `wss://${apiHost}/sip-bridge` +
          `?server=${encodeURIComponent(cfg.server)}` +
          `&port=${cfg.port ?? 5060}` +
          `&token=${encodeURIComponent(token)}`;
      } else {
        const defaultPort = transport === "wss" ? 8089 : 5066;
        serverUrl = `${transport}://${cfg.server}:${cfg.port ?? defaultPort}/ws`;
      }

      // Pré-flight: ws:// (texto puro) num painel servido por HTTPS é bloqueado
      // pelo navegador (mixed content) e nunca conecta. Sem este guard, sip.js
      // tenta abrir um socket condenado e o erro "closed before established" se
      // repete, gerando tarefas longas que travam a main thread (chega a atrapalhar
      // a seleção de texto no atendimento). Falha cedo com erro claro.
      if (window.location.protocol === "https:" && serverUrl.startsWith("ws://")) {
        console.error(
          "[SIP] Conexão ws:// bloqueada em painel HTTPS (mixed content). " +
            "Use transport 'wss' (porta padrão 8089) na configuração SIP do usuário."
        );
        if (!destroyed) setCallStatus("error");
        return;
      }

      const ua = new UserAgent({
        uri,
        transportOptions: {
          server: serverUrl,
        },
        authorizationUsername: cfg.username,
        authorizationPassword: cfg.password,
        logLevel: "error",
        sessionDescriptionHandlerFactoryOptions: {
          constraints: { audio: true, video: false },
        },
        delegate: {
          onInvite: (invitation) => {
            if (destroyed) return;
            sipSession.session = invitation;
            const remoteUri =
              invitation.remoteIdentity.uri.user || "Desconhecido";
            // startCall sets isVisible=true in the store → WebphoneModal opens
            startCall({ phone: remoteUri, direction: "incoming" });
            // Vue: handleIncomingCall → CriarCallLog('Received')
            createCallLog({
              userId: user!.userId,
              tenantId: user!.tenantId,
              phoneNumber: cfg.username,
              originNumber: cfg.username,
              destinationNumber: remoteUri,
              callDuration: null,
              callStatus: "Received",
            }).catch(() => {});
            invitation.stateChange.addListener((s: SessionState) => {
              if (s === SessionState.Terminated) {
                endCall();
                sipSession.session = null;
              }
            });
          },
        },
      });

      sipSession.ua = ua;
      sipSession.sipUsername = cfg.username;
      if (!destroyed) setCallStatus("registering");

      try {
        await ua.start();
        if (destroyed) {
          ua.stop().catch(() => {});
          return;
        }
        const reg = new Registerer(ua);
        sipSession.registerer = reg;
        await reg.register();
        if (!destroyed) setSipRegistered(true);
      } catch {
        if (!destroyed) setCallStatus("error");
      }
    }, 0);

    return () => {
      destroyed = true;
      clearTimeout(timerId);
      sipSession.registerer?.dispose();
      sipSession.registerer = null;
      sipSession.ua?.stop().catch(() => {});
      sipSession.ua = null;
      sipSession.session = null;
      setSipRegistered(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg?.server, cfg?.port, cfg?.username, cfg?.password]);

  return null;
}
