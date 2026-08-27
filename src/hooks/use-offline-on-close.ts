"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { updateUserIsOnline } from "@/services/users";

// Espelha a escolha "ficar offline" do diálogo de logout (header/sidebar) no
// fechamento da aba/janela. Navegadores não permitem diálogo customizado durante
// o unload (beforeunload só exibe o aviso genérico, sem botões próprios), então a
// escolha é aplicada automaticamente ao fechar a ÚLTIMA aba do app.
// Opt-in por tenant: setting "offlineOnTabClose" em /configuracoes/geral
// (default disabled = comportamento antigo, fechar aba não muda o status).
// Comportamento quando habilitado:
//   - Registro de abas vivas com heartbeat no localStorage — com outra aba aberta,
//     fechar uma delas NÃO marca offline (o status seguiria visível/correto para
//     colegas e para a distribuição automática por fila, que filtra por isOnline).
//   - O offline automático grava a flag AUTO_OFFLINE_FLAG; o próximo mount (F5,
//     reabrir o app) ou a restauração via bfcache (pageshow persisted) restaura o
//     online — espelha o login, que também marca online.
//   - Offline manual (toggle do header → store isOnline === false) não dispara o
//     beacon nem a flag, então sobrevive ao refresh.
// O envio usa fetch keepalive (sobrevive ao unload; axios não) no mesmo endpoint
// do diálogo de logout (PUT /usersIsOnline/:userId).

const TAB_KEY_PREFIX = "zproTabAlive:";
const AUTO_OFFLINE_FLAG = "zproAutoOfflineOnClose";
const HEARTBEAT_MS = 15000;
const STALE_MS = 45000; // 3 heartbeats perdidos = aba morta (crash/kill do browser)

function hasOtherLiveTab(ownKey: string): boolean {
  const now = Date.now();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(TAB_KEY_PREFIX) || key === ownKey) continue;
    const ts = Number(localStorage.getItem(key));
    if (ts && now - ts < STALE_MS) return true;
  }
  return false;
}

function removeStaleTabKeys(): void {
  const now = Date.now();
  const stale: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(TAB_KEY_PREFIX)) continue;
    const ts = Number(localStorage.getItem(key));
    if (!ts || now - ts >= STALE_MS) stale.push(key);
  }
  stale.forEach((k) => localStorage.removeItem(k));
}

function sendOfflineKeepalive(userId: number): void {
  let token: string | null = null;
  try {
    const raw = localStorage.getItem("token");
    token = raw ? (JSON.parse(raw) as string) : null;
  } catch {
    /* sem token legível → sem beacon */
  }
  if (!token) return;
  const baseURL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3101";
  try {
    void fetch(`${baseURL}/usersIsOnline/${userId}`, {
      method: "PUT",
      keepalive: true,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ isOnline: false }),
    });
  } catch {
    /* best-effort: fechar a aba nunca pode travar */
  }
}

export function useOfflineOnClose(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const tabKey = `${TAB_KEY_PREFIX}${Math.random().toString(36).slice(2)}`;
    const beat = () => {
      try {
        localStorage.setItem(tabKey, String(Date.now()));
      } catch {
        /* storage indisponível/cheio */
      }
    };
    beat();
    try {
      removeStaleTabKeys();
    } catch {
      /* ignore */
    }
    const heartbeat = setInterval(beat, HEARTBEAT_MS);

    const healIfAutoOffline = () => {
      try {
        if (localStorage.getItem(AUTO_OFFLINE_FLAG) !== "1") return;
        localStorage.removeItem(AUTO_OFFLINE_FLAG);
      } catch {
        return;
      }
      const { user, patchUser } = useAuthStore.getState();
      if (!user?.userId) return;
      updateUserIsOnline(user.userId, true)
        .then(() => patchUser({ isOnline: true }))
        .catch(() => {
          /* best-effort */
        });
    };
    healIfAutoOffline();

    const onPageHide = () => {
      try {
        localStorage.removeItem(tabKey);
      } catch {
        /* ignore */
      }
      const { user, getConfigValue } = useAuthStore.getState();
      // Lido no momento do evento (não no mount): a setting chega async via
      // fetchSettings e pode mudar em runtime sem remount do layout.
      if (getConfigValue("offlineOnTabClose") !== "enabled") return;
      // Offline manual é escolha do usuário — não sobrescreve nem seta a flag de heal.
      if (!user?.userId || user.isOnline === false) return;
      try {
        if (hasOtherLiveTab(tabKey)) return;
      } catch {
        /* na dúvida (storage inacessível), segue e marca offline */
      }
      try {
        localStorage.setItem(AUTO_OFFLINE_FLAG, "1");
      } catch {
        /* ignore */
      }
      sendOfflineKeepalive(user.userId);
    };

    // bfcache: a aba não fechou de fato (voltar/avançar, app em background no
    // mobile) — re-registra a aba e desfaz o offline automático.
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      beat();
      healIfAutoOffline();
    };

    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      try {
        localStorage.removeItem(tabKey);
      } catch {
        /* ignore */
      }
    };
  }, [enabled]);
}
