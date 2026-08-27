"use client";

import { useEffect } from "react";
import { useWebphoneStore } from "@/stores/webphone-store";

export function CallTimer() {
  const callStatus = useWebphoneStore((s) => s.callStatus);
  const callDuration = useWebphoneStore((s) => s.callDuration);

  useEffect(() => {
    if (callStatus !== "established") return;
    // Lê/escreve via getState() para o setInterval ser criado UMA vez (quando a
    // chamada é estabelecida) e não recriado a cada segundo. O bug anterior mantinha
    // callDuration no array de deps, recriando o timer a cada tick — re-render 1Hz
    // de toda a árvore que assina a store (atrapalhava a seleção no atendimento).
    const id = setInterval(() => {
      const { callDuration: current, setCallDuration } = useWebphoneStore.getState();
      setCallDuration(current + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [callStatus]);

  if (callStatus !== "established") return null;

  const mins = Math.floor(callDuration / 60)
    .toString()
    .padStart(2, "0");
  const secs = (callDuration % 60).toString().padStart(2, "0");

  return (
    <span className="font-mono text-lg tabular-nums text-foreground">
      {mins}:{secs}
    </span>
  );
}
