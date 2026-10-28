"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchWebchatInviteMessage,
  getCachedWebchatInviteMessage,
  subscribeWebchatInviteMessage,
  type WebchatInviteMessage,
} from "@/services/webchat";

/**
 * Canais em que o atendimento oferece "Enviar convite do WebChat": os oficiais, que cobram
 * por mensagem enviada. O texto sai pelo envio de texto de sempre de cada canal, e o servidor
 * troca {{linkWebchat}} pelo link do atendimento.
 */
const WEBCHAT_INVITE_SEND_CHANNELS = ["waba", "dialog360", "gupshup"];

export function isWebchatInviteSendChannel(channel: unknown): boolean {
  return typeof channel === "string" && WEBCHAT_INVITE_SEND_CHANNELS.includes(channel.toLowerCase());
}

/**
 * Convite pronto na empresa + texto que vai ao cliente (GET /webchat-invite/message, 60 s de
 * cache dividido entre quem pergunta). `enabled` falso = nada é perguntado e `info` é null
 * (atendimento de outro canal, de grupo ou fechado).
 */
export function useWebchatInviteMessage(enabled: boolean): {
  info: WebchatInviteMessage | null;
  refresh: () => Promise<WebchatInviteMessage | null>;
} {
  const [info, setInfo] = useState<WebchatInviteMessage | null>(() => getCachedWebchatInviteMessage() ?? null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const unsubscribe = subscribeWebchatInviteMessage((value) => {
      if (alive) setInfo(value);
    });
    fetchWebchatInviteMessage()
      .then((value) => {
        if (alive) setInfo(value);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [enabled]);

  const refresh = useCallback(() => fetchWebchatInviteMessage({ fresh: true }), []);

  return { info: enabled ? info : null, refresh };
}
