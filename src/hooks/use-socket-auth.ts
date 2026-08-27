"use client";

import { useEffect } from "react";
import { getSocket, disconnectSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth-store";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export function useSocketAuth() {
  const t = useTranslations("useSocketAuth");
  const { user, isAuthenticated, clearAuth } = useAuthStore();
  const tenantId = user?.tenantId;
  const userId = user?.userId;

  useEffect(() => {
    if (!isAuthenticated || !tenantId || !userId) return;

    const socket = getSocket();

    const handleTokenInvalid = () => {
      disconnectSocket();
      clearAuth();
      window.location.href = "/login";
    };

    const handleForceLogout = (data: { userId: number; message?: string; reason?: string }) => {
      if (Number(data.userId) === Number(userId)) {
        disconnectSocket();
        clearAuth();
        const msg = data.reason === "inactivated" ? t("userInactivated") : (data.message || t("forceLogout"));
        toast.warning(msg);
        setTimeout(() => {
          window.location.href = "/login";
        }, 2000);
      }
    };

    const handleSessionInvalidated = (data: { message?: string }) => {
      disconnectSocket();
      clearAuth();
      toast.error(data.message || t("sessionInvalid"));
      setTimeout(() => {
        window.location.href = "/login";
      }, 2000);
    };

    socket.on(`tokenInvalid:${socket.id}`, handleTokenInvalid);
    socket.on(`${tenantId}:forceLogout`, handleForceLogout);
    socket.on(`sessionInvalidated:${socket.id}`, handleSessionInvalidated);

    return () => {
      socket.off(`tokenInvalid:${socket.id}`, handleTokenInvalid);
      socket.off(`${tenantId}:forceLogout`, handleForceLogout);
      socket.off(`sessionInvalidated:${socket.id}`, handleSessionInvalidated);
    };
  }, [isAuthenticated, tenantId, userId, clearAuth, t]);
}
