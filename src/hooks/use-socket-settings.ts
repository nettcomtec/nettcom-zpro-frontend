"use client";

import { useEffect } from "react";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Hook que escuta `tenantId:settings` (emitido pelo backend em
 * SettingControllerZPRO.update e AdminControllerZPRO.updateSettings) e espelha a
 * chave alterada no `configuracoes` do auth-store.
 *
 * Sem isto o backend emitia o evento para ninguém: o store só era populado no mount
 * do (dashboard)/layout.tsx, então qualquer setting alterado só passava a valer após
 * F5 — inclusive nas OUTRAS sessões do tenant, que nem sabiam da mudança. Quem lê
 * `getConfigValue` em runtime (ex.: o gate de som `notificationSilenced` nos hooks de
 * socket de tickets) ficava com o valor antigo indefinidamente.
 *
 * Cobre apenas a tabela Settings — os endpoints tenant-level (PUT /tenants/...) não
 * emitem socket, e suas chaves entram no store sob outro nome via injectTenantSettings.
 *
 * Deve ser chamado no (dashboard)/layout.tsx para ficar ativo em toda a área autenticada.
 */
export function useSocketSettings() {
  const tenantId = useAuthStore((s) => s.user?.tenantId);
  const setConfiguracoes = useAuthStore((s) => s.setConfiguracoes);

  useEffect(() => {
    if (!tenantId) return;
    const socket = getSocket();
    if (!socket) return;

    const channel = `${tenantId}:settings`;

    const onSettingsUpdate = (payload: {
      action?: string;
      setting?: { key?: string; value?: string; tenantId?: number };
    }) => {
      if (payload?.action !== "update") return;
      const key = payload.setting?.key;
      const value = payload.setting?.value;
      // value pode ser "" legitimamente (ex.: reset de fluxo do bot) — só descarta
      // quando não veio no payload.
      if (!key || value == null) return;
      // Guard de tenant: a sala já é por tenant, mas o superadmin edita settings de
      // outros tenants pelo painel e não pode contaminar o próprio store.
      if (payload.setting?.tenantId != null && Number(payload.setting.tenantId) !== Number(tenantId)) return;
      // setConfiguracoes faz merge por chave (não substitui o array), então mandar
      // uma chave isolada preserva todo o resto do store.
      setConfiguracoes([{ key, value: String(value) }]);
    };

    socket.on(channel, onSettingsUpdate);

    return () => {
      socket.off(channel, onSettingsUpdate);
    };
  }, [tenantId, setConfiguracoes]);
}
