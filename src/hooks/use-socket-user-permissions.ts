"use client";

import { useEffect } from "react";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth-store";
import { resetAllStores } from "@/stores/reset-all-stores";

/**
 * Hook que escuta `tenantId:user:permissionsUpdated` e
 * `tenantId:tenant:customProfileSettingsChanged` emitidos pelo backend
 * (§34.7 / §35.11) e re-sincroniza o store + recarrega o user atual.
 *
 * Deve ser chamado no (dashboard)/layout.tsx para ficar ativo em toda a área autenticada.
 */
export function useSocketUserPermissions() {
  const user = useAuthStore((s) => s.user);
  const patchUser = useAuthStore((s) => s.patchUser);
  const tenantId = user?.tenantId;
  const userId = user?.userId;

  useEffect(() => {
    if (!tenantId || !userId) return;
    const socket = getSocket();
    if (!socket) return;

    const permsChannel = `${tenantId}:user:permissionsUpdated`;
    const tenantChannel = `${tenantId}:tenant:customProfileSettingsChanged`;

    const onPermsUpdated = (payload: {
      userId: number;
      customPermissions: Record<string, boolean> | null;
      menuPermissions: Record<string, boolean> | null;
    }) => {
      if (payload.userId !== userId) return;
      // Atualiza o customProfile do user com os novos valores do template.
      const current = useAuthStore.getState().user;
      if (!current) return;
      patchUser({
        customProfile: current.customProfile
          ? {
              ...current.customProfile,
              customPermissions:
                (payload.customPermissions as unknown as typeof current.customProfile.customPermissions) ??
                current.customProfile.customPermissions,
              menuPermissions:
                payload.menuPermissions ?? current.customProfile.menuPermissions,
            }
          : null,
      });
      // Invalida caches dependentes
      resetAllStores();
    };

    const onTenantFlagChanged = (payload: {
      tenantId: number;
      customProfileEnabled: boolean;
    }) => {
      if (payload.tenantId !== tenantId) return;
      patchUser({ customProfileEnabled: payload.customProfileEnabled });
      resetAllStores();
    };

    socket.on(permsChannel, onPermsUpdated);
    socket.on(tenantChannel, onTenantFlagChanged);

    return () => {
      socket.off(permsChannel, onPermsUpdated);
      socket.off(tenantChannel, onTenantFlagChanged);
    };
  }, [tenantId, userId, patchUser]);
}
