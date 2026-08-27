"use client";

import { useEffect, useRef } from "react";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth-store";
import { useWhatsappStore } from "@/stores/whatsapp-store";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export function useSocketWhatsapp() {
  const t = useTranslations("useSocketWhatsapp");
  const { user, isAuthenticated } = useAuthStore();
  const { updateWhatsapp, removeWhatsapp } = useWhatsappStore();
  const tenantId = user?.tenantId;
  const profile = user?.profile;
  const initialized = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !tenantId || initialized.current) return;

    const socket = getSocket();
    initialized.current = true;

    const handleWhatsapp = (data: { action: string; whatsapp?: Record<string, unknown>; whatsappId?: number }) => {
      if (data.action === "update" && data.whatsapp) {
        updateWhatsapp(data.whatsapp as { id: number });
      }
      if (data.action === "delete" && data.whatsappId) {
        removeWhatsapp(data.whatsappId);
      }
    };

    const handleWhatsappSession = (data: { action: string; session?: { id: number; name?: string; number?: string }; percent?: number }) => {
      if (data.action === "update" && data.session) {
        updateWhatsapp(data.session);
      }
      if (profile === "superadmin") return;
      if (data.action === "loadingscreen") {
        toast.info(t("loadingSession", { name: data.session?.name ?? "", percent: data.percent ?? 0 }));
      }
      if (data.action === "readySession" && (data.session as any)?.status === "CONNECTED") {
        toast.success(t("sessionReady", { name: data.session?.name ?? "", number: data.session?.number ?? "" }));
      }
    };

    const handleWavoip = (data: { action: string; session?: { name?: string; wavoipToken?: string } }) => {
      if (profile === "superadmin") return;
      // Gate lido no momento do evento (getState) para não re-inscrever o socket a
      // cada mudança do interruptor: com o WaVoIP desligado no tenant, o toast some.
      if (!useAuthStore.getState().isWavoipEnabled()) return;
      if (data.action === "update") {
        toast.info(t("wavoipUpdated", { name: data.session?.name ?? "" }));
      }
    };

    socket.on(`${tenantId}:whatsapp`, handleWhatsapp);
    socket.on(`${tenantId}:whatsappSession`, handleWhatsappSession);
    socket.on(`${tenantId}:wavoip`, handleWavoip);

    return () => {
      socket.off(`${tenantId}:whatsapp`, handleWhatsapp);
      socket.off(`${tenantId}:whatsappSession`, handleWhatsappSession);
      socket.off(`${tenantId}:wavoip`, handleWavoip);
      initialized.current = false;
    };
  }, [isAuthenticated, tenantId, updateWhatsapp, removeWhatsapp]);
}
