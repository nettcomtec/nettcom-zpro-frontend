"use client";

/**
 * AsteriskSipProvider — background SIP UA manager.
 * Always mounted in the dashboard layout when sipEnabled, mirroring the legacy front's
 * AsteriskWebphone in MainLayout (always mounted, visually hidden).
 *
 * Registers on page load so incoming calls arrive even before the modal opens.
 * On incoming call: calls startCall() which sets isVisible=true → modal opens.
 *
 * Conexão, registro e reconexão automática moram em lib/sip-link.ts.
 */

import { useEffect, useRef } from "react";
import { SessionState, Web, type Invitation } from "sip.js";
import { useTranslations } from "next-intl";
import { startCallRingtone } from "@/lib/call-ringtone";
import { SipLink } from "@/lib/sip-link";
import { isPageInBackground, showIncomingSipCallNotification } from "@/lib/sip-call-notification";
import { getPwaIconUrl } from "@/lib/branding-urls";
import { useAuthStore } from "@/stores/auth-store";
import { useLiveModeStore } from "@/stores/live-mode-store";
import { isSipCallActive, useWebphoneStore } from "@/stores/webphone-store";
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

// Ponte UDP do backend: a URL leva o token do login, que vence e é renovado — por isso é
// montada de novo a cada conexão (a reconexão com o token velho seria recusada).
const buildBridgeUrl = (sipServer: string, port: number | undefined): string => {
  const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? window.location.origin;
  const apiHost = new URL(apiOrigin).host;
  let token = "";
  try {
    const raw = localStorage.getItem("token");
    token = raw ? (JSON.parse(raw) as string) : "";
  } catch { /* ignore */ }
  return (
    `wss://${apiHost}/sip-bridge` +
    `?server=${encodeURIComponent(sipServer)}` +
    `&port=${port ?? 5060}` +
    `&token=${encodeURIComponent(token)}`
  );
};

export function AsteriskSipProvider() {
  const { user } = useAuthStore();
  const { startCall, setSipLinkStatus, setSipRegistered, endCall } = useWebphoneStore();
  const callStatus = useWebphoneStore((s) => s.callStatus);
  const incomingDirection = useWebphoneStore((s) => s.callInfo?.direction);
  const t = useTranslations("asteriskWebphone");
  const tLive = useTranslations("liveMode");
  // Textos lidos na hora da chamada, sem reiniciar o ramal quando o idioma muda.
  const textsRef = useRef({ t, tLive });
  textsRef.current = { t, tLive };

  const cfg = user?.sipConfig;
  // Lido só quando o ramal (re)conecta, fora das dependências do efeito: mudar o
  // keep-alive (ou a chave faltar numa atualização de 30 s) não pode recriar o
  // WebPhone, o que derrubaria uma chamada em curso. Vale na próxima abertura do painel.
  const keepAliveRef = useRef(cfg?.keepAliveInterval);
  keepAliveRef.current = cfg?.keepAliveInterval;

  // Toque enquanto há chamada SIP recebida — mesmo mecanismo das demais telas
  // de chamada: arquivo de public/ quando existir, senão o beep sintetizado de
  // sempre. Ver lib/call-ringtone.ts.
  useEffect(() => {
    if (callStatus !== "ringing" || incomingDirection !== "incoming") return;
    return startCallRingtone();
  }, [callStatus, incomingDirection]);

  useEffect(() => {
    // Aparados como no "Testar conexão": com espaço sobrando o sip.js não monta a URI.
    const sipServer = (cfg?.server || "").trim();
    const sipUser = (cfg?.username || "").trim();
    const sipDomain = (cfg?.domain || "").trim();
    if (!sipServer || !sipUser || !cfg?.password) return;

    const transport = (cfg.transport ?? "wss") as "wss" | "ws" | "udp";

    const handleInvite = (invitation: Invitation) => {
      sipSession.session = invitation;
      const remoteUri =
        invitation.remoteIdentity.uri.user || "Desconhecido";
      // startCall sets isVisible=true in the store → WebphoneModal opens
      startCall({ phone: remoteUri, direction: "incoming" });
      // Front legado: handleIncomingCall → CriarCallLog('Received')
      createCallLog({
        userId: user!.userId,
        tenantId: user!.tenantId,
        phoneNumber: sipUser,
        originNumber: sipUser,
        destinationNumber: remoteUri,
        callDuration: null,
        callStatus: "Received",
      }).catch(() => {});
      // Aba minimizada ou atrás de outra janela: o WebPhone abre onde ninguém vê.
      let closeNotification = () => {};
      if (isPageInBackground()) {
        const { t: tw, tLive: tl } = textsRef.current;
        const live = useLiveModeStore.getState();
        const hideContent = live.envEnabled && live.active;
        closeNotification = showIncomingSipCallNotification({
          title: tw("callReceived"),
          body: hideContent ? tl("notificationBodyHidden") : tw("incomingCallNotificationBody", { caller: remoteUri }),
          icon: getPwaIconUrl("icon-192x192.png"),
          onClick: () => useWebphoneStore.getState().toggleVisibility(true),
        });
      }
      invitation.stateChange.addListener((s: SessionState) => {
        // Atendida, recusada ou encerrada: o aviso some.
        if (s !== SessionState.Initial) closeNotification();
        if (s === SessionState.Terminated) {
          endCall();
          sipSession.session = null;
        }
      });
    };

    const link = new SipLink({
      config: {
        server: sipServer,
        username: sipUser,
        password: cfg.password,
        // Domínio SIP do ramal pode diferir do servidor de conexão (SBC na frente do WebRTC).
        domain: sipDomain || undefined,
        port: cfg.port,
        transport,
        keepAliveInterval: keepAliveRef.current,
      },
      onStatus: (status) => setSipLinkStatus(status),
      onInvite: handleInvite,
      userAgentOptions: {
        sessionDescriptionHandlerFactory: Web.defaultSessionDescriptionHandlerFactory(micStreamFactory),
        sessionDescriptionHandlerFactoryOptions: {
          constraints: { audio: true, video: false },
        },
      },
      buildBridgeUrl: transport === "udp" ? () => buildBridgeUrl(sipServer, cfg.port) : undefined,
      isCallActive: () => isSipCallActive(useWebphoneStore.getState().callStatus),
    });

    // setTimeout(0) — defer so React StrictMode's synchronous fake-unmount fires
    // clearTimeout before any WebSocket is opened. Mirrors the legacy front's single mounted() call.
    const timerId = setTimeout(() => {
      sipSession.link = link;
      sipSession.sipUsername = sipUser;
      link.start();
      sipSession.ua = link.userAgent;
    }, 0);

    return () => {
      clearTimeout(timerId);
      // Para timers, ouvintes de aba/rede, o registro e o socket desta configuração.
      link.dispose();
      if (sipSession.link === link) {
        sipSession.link = null;
        sipSession.ua = null;
        sipSession.session = null;
      }
      setSipRegistered(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg?.server, cfg?.domain, cfg?.port, cfg?.username, cfg?.password, cfg?.transport]);

  return null;
}
