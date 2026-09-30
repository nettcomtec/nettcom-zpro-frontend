"use client";

/**
 * AsteriskSipProvider — background SIP UA manager.
 * Always mounted in the dashboard layout when sipEnabled, mirroring the legacy front's
 * AsteriskWebphone in MainLayout (always mounted, visually hidden).
 *
 * Registers on page load so incoming calls arrive even before the modal opens.
 * On incoming call: calls startCall() which sets isVisible=true → modal opens.
 */

import { useEffect } from "react";
import { UserAgent, Registerer, SessionState, Web } from "sip.js";
import { startCallRingtone } from "@/lib/call-ringtone";
import { useAuthStore } from "@/stores/auth-store";
import { useWebphoneStore } from "@/stores/webphone-store";
import { sipSession, SIP_MIC_TIMEOUT_ERROR } from "./sip-session";
import { createCallLog } from "@/services/call-logs";

const MIC_TIMEOUT_MS = 15_000;

// getUserMedia fica pendente para sempre quando o usuário ignora o pedido de
// microfone — o sip.js só monta o INVITE depois dele, então a tela ficava em
// "Chamando..." sem nada no fio. Com o teto, invite()/accept() rejeitam e a UI
// se libera. Stream que chega depois do teto é descartado (senão o microfone
// ficaria aceso sem chamada).
const micStreamFactory: Web.MediaStreamFactory = (constraints, sdh, options) => {
  const base = Web.defaultMediaStreamFactory();
  return new Promise<MediaStream>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      const err = new Error("Microphone request timed out");
      err.name = SIP_MIC_TIMEOUT_ERROR;
      reject(err);
    }, MIC_TIMEOUT_MS);
    base(constraints, sdh, options).then(
      (stream) => {
        clearTimeout(timer);
        if (settled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        settled = true;
        resolve(stream);
      },
      (err) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        reject(err);
      }
    );
  });
};

export function AsteriskSipProvider() {
  const { user } = useAuthStore();
  const { startCall, setCallStatus, setSipRegistered, endCall } = useWebphoneStore();
  const callStatus = useWebphoneStore((s) => s.callStatus);
  const incomingDirection = useWebphoneStore((s) => s.callInfo?.direction);

  const cfg = user?.sipConfig;

  // Toque enquanto há chamada SIP recebida — mesmo mecanismo das demais telas
  // de chamada: arquivo de public/ quando existir, senão o beep sintetizado de
  // sempre. Ver lib/call-ringtone.ts.
  useEffect(() => {
    if (callStatus !== "ringing" || incomingDirection !== "incoming") return;
    return startCallRingtone();
  }, [callStatus, incomingDirection]);

  useEffect(() => {
    if (!cfg?.server || !cfg?.username || !cfg?.password) return;

    let destroyed = false;

    // Domínio SIP do ramal pode diferir do servidor de conexão (SBC na frente do WebRTC).
    const uri = UserAgent.makeURI(`sip:${cfg.username}@${cfg.domain || cfg.server}`);
    if (!uri) return;

    // setTimeout(0) — defer so React StrictMode's synchronous fake-unmount fires
 // clearTimeout before any WebSocket is opened. Mirrors the legacy front's single mounted() call.
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
        sessionDescriptionHandlerFactory: Web.defaultSessionDescriptionHandlerFactory(micStreamFactory),
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
 // Front legado: handleIncomingCall → CriarCallLog('Received')
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
  }, [cfg?.server, cfg?.domain, cfg?.port, cfg?.username, cfg?.password]);

  return null;
}
