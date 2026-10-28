"use client";

import { useEffect } from "react";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth-store";
import { usePanelAppsStore } from "@/stores/panel-apps-store";
import { PANEL_APPS_GLOBAL_EVENT, PANEL_APPS_TENANT_EVENT } from "@/lib/panel-apps";

/**
 * Avisos de mudança nos aplicativos personalizados (docs/PLANO_APLICATIVOS_PERSONALIZADOS.md
 * §5.3, D28). O servidor já agrupa as mudanças e manda só às salas afetadas; aqui cada
 * navegador espera um tempo ALEATÓRIO antes de buscar de novo, para a empresa inteira não
 * bater no `/panel-apps/mine` no mesmo segundo:
 * - `${tenantId}:panelApps` (apps da empresa) → 0–10 s;
 * - `panelApps:global` (apps do provedor) → 0–30 s;
 * - `${tenantId}:user:permissionsUpdated` (só do próprio usuário) e
 *   `${tenantId}:tenant:customProfileSettingsChanged` → 1–5 s (o servidor solta o cache
 *   de login logo depois de avisar; o mínimo de 1 s evita buscar com o snapshot velho).
 *
 * Um único timer por sessão: aviso novo só ANTECIPA a busca já marcada (nunca adia nem
 * empilha), e a busca leva a maior versão recebida (`v`) para o servidor não responder
 * com a lista velha do cache. A busca é `force` e mantém a lista atual até a resposta
 * (o store fora do `resetAllStores`, Ag1-4/Ag2-A1). Superadmin ouve só o aviso global
 * (as apps dele são as do provedor marcadas "mostrar no meu menu").
 *
 * Deve ser chamado no (dashboard)/layout.tsx.
 */

const TENANT_MAX_DELAY_MS = 10_000;
const GLOBAL_MAX_DELAY_MS = 30_000;
const PERMISSION_MIN_DELAY_MS = 1_000;
const PERMISSION_MAX_DELAY_MS = 5_000;

const randomDelay = (min: number, max: number): number => min + Math.floor(Math.random() * Math.max(0, max - min));

const noticeVersion = (payload: unknown): number | undefined => {
  const v = (payload as { v?: unknown } | null)?.v;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : undefined;
};

export function useSocketPanelApps() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const tenantId = useAuthStore((s) => s.user?.tenantId);
  const userId = useAuthStore((s) => s.user?.userId);
  const profile = useAuthStore((s) => s.user?.profile);

  useEffect(() => {
    if (!isAuthenticated || !tenantId || !userId) return;
    const socket = getSocket();
    if (!socket) return;

    const isSuperadmin = profile === "superadmin";
    let timer: ReturnType<typeof setTimeout> | null = null;
    let fireAt = 0;
    // Versão por escopo: o aviso das globais só força a recarga do cache das globais no
    // servidor (sem isso cada empresa recarregava o próprio snapshot a cada mudança global).
    let pendingTenantVersion: number | undefined;
    let pendingGlobalVersion: number | undefined;

    const schedule = (delayMs: number, scope?: "tenant" | "global", version?: number) => {
      if (version !== undefined && scope === "tenant") pendingTenantVersion = Math.max(pendingTenantVersion ?? 0, version);
      if (version !== undefined && scope === "global") pendingGlobalVersion = Math.max(pendingGlobalVersion ?? 0, version);
      const at = Date.now() + delayMs;
      // Já há busca marcada para antes (ou no mesmo instante): só junta a versão.
      if (timer && fireAt <= at) return;
      if (timer) clearTimeout(timer);
      fireAt = at;
      timer = setTimeout(() => {
        timer = null;
        fireAt = 0;
        const versions = { tenant: pendingTenantVersion, global: pendingGlobalVersion };
        pendingTenantVersion = undefined;
        pendingGlobalVersion = undefined;
        void usePanelAppsStore.getState().fetch({ force: true, versions });
      }, delayMs);
    };

    const onTenantNotice = (payload: unknown) => {
      schedule(randomDelay(0, TENANT_MAX_DELAY_MS), "tenant", noticeVersion(payload));
    };

    const onGlobalNotice = (payload: unknown) => {
      schedule(randomDelay(0, GLOBAL_MAX_DELAY_MS), "global", noticeVersion(payload));
    };

    const onPermissionsUpdated = (payload: { userId?: number | string } | null) => {
      if (payload?.userId == null || Number(payload.userId) !== Number(userId)) return;
      schedule(randomDelay(PERMISSION_MIN_DELAY_MS, PERMISSION_MAX_DELAY_MS));
    };

    const onCustomProfileSettingsChanged = (payload: { tenantId?: number | string } | null) => {
      if (payload?.tenantId != null && Number(payload.tenantId) !== Number(tenantId)) return;
      // Ligar/desligar perfis personalizados só muda o menu de quem É personalizado: os
      // demais não rebuscam (a empresa inteira bateria no servidor logo depois de o cache
      // de login ter sido solto).
      if (profile !== "custom") return;
      schedule(randomDelay(PERMISSION_MIN_DELAY_MS, PERMISSION_MAX_DELAY_MS));
    };

    const tenantChannel = PANEL_APPS_TENANT_EVENT(tenantId);
    const permsChannel = `${tenantId}:user:permissionsUpdated`;
    const customProfileChannel = `${tenantId}:tenant:customProfileSettingsChanged`;

    socket.on(PANEL_APPS_GLOBAL_EVENT, onGlobalNotice);
    if (!isSuperadmin) {
      socket.on(tenantChannel, onTenantNotice);
      socket.on(permsChannel, onPermissionsUpdated);
      socket.on(customProfileChannel, onCustomProfileSettingsChanged);
    }

    return () => {
      if (timer) clearTimeout(timer);
      timer = null;
      socket.off(PANEL_APPS_GLOBAL_EVENT, onGlobalNotice);
      if (!isSuperadmin) {
        socket.off(tenantChannel, onTenantNotice);
        socket.off(permsChannel, onPermissionsUpdated);
        socket.off(customProfileChannel, onCustomProfileSettingsChanged);
      }
    };
  }, [isAuthenticated, tenantId, userId, profile]);
}
