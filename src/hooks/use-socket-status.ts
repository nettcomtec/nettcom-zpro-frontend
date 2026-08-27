"use client";

import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";

/**
 * Estado da conexão do socket para feedback visual (pill "Reconectando...").
 * `reconnecting` só vira true após `graceMs` de queda contínua (evita piscar em
 * blips de rede); volta a false imediatamente no reconnect. Somente UI — o
 * resync de dados pós-reconexão já é feito pelos hooks de socket existentes.
 */
export function useSocketStatus(graceMs = 4000) {
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    const s = getSocket();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onDisconnect = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setReconnecting(true), graceMs);
    };
    const onConnect = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      setReconnecting(false);
    };

    s.on("disconnect", onDisconnect);
    s.on("connect", onConnect);
    if (!s.connected) onDisconnect();

    return () => {
      if (timer) clearTimeout(timer);
      s.off("disconnect", onDisconnect);
      s.off("connect", onConnect);
    };
  }, [graceMs]);

  return { reconnecting };
}
