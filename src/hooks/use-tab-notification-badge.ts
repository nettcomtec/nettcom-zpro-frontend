"use client";

import { useEffect } from "react";
import { setTitleBadgeCount } from "@/lib/tab-title";
import { setFaviconBadgeCount } from "@/lib/favicon-badge";

/**
 * Espelha a contagem de não lidos do header (badge do sino) no título da aba,
 * no favicon e no ícone do PWA instalado.
 *
 * Deve ser chamado no Header, onde `totalBadge` já é calculado de forma reativa
 * (unreadCount + chatUnread + convitesCount) — assim a aba sempre bate com o sino.
 *
 * @param totalBadge contagem do sino (mesma variável exibida no header)
 * @param disabled   quando true, força 0 (ex.: superadmin, que não tem sino)
 */
export function useTabNotificationBadge(totalBadge: number, disabled = false): void {
  const effective = disabled ? 0 : Math.max(0, totalBadge);

  useEffect(() => {
    setTitleBadgeCount(effective);
    setFaviconBadgeCount(effective);
  }, [effective]);

  // Cleanup só no unmount (ex.: logout desmonta o Header): limpa o badge para não
  // vazar "(N)" na tela de login nem deixar badge preso no ícone do PWA.
  useEffect(() => {
    return () => {
      setTitleBadgeCount(0);
      setFaviconBadgeCount(0);
    };
  }, []);
}
