"use client";

import { useEffect, useRef } from "react";
import { getSocket, disconnectSocket, ensureConnectedFromStorage } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth-store";
import { useSocketTickets } from "./use-socket-tickets";
import { useSocketTicketsOtm } from "./use-socket-tickets-otm";
import { useSocketWhatsapp } from "./use-socket-whatsapp";
import { useSocketChat } from "./use-socket-chat";
import { useSocketAuth } from "./use-socket-auth";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export function useSocket() {
  const t = useTranslations("useSocket");
  const { user, isAuthenticated } = useAuthStore();
  const tenantId = user?.tenantId;
  const profile = user?.profile;
  const initialized = useRef(false);

  useSocketAuth();
  useSocketTickets();
  useSocketTicketsOtm();
  useSocketWhatsapp();
  useSocketChat();

  useEffect(() => {
    if (!isAuthenticated || !tenantId || initialized.current) return;

    ensureConnectedFromStorage();
    const socket = getSocket();
    initialized.current = true;

    // Re-join the notification room on every (re)connection. In cluster mode a
    // reconnect can land on a different worker; tenant/user rooms are re-joined
    // via the handshake `auth`, but the notification room is opt-in via this
    // emit, so it must be re-sent on each `connect` or notification events
    // (e.g. ticket delete) stop arriving after a reconnect. The join is
    // idempotent on the backend, so emitting again is safe.
    const joinNotification = () => {
      socket.emit(`${tenantId}:joinNotification`);
    };
    // Fire immediately for the current (already-connected) session, then keep
    // re-joining on every future reconnect.
    joinNotification();
    socket.on("connect", joinNotification);

    socket.on(`${tenantId}:importMessages`, (data: { action: string; status?: { all: number; this: number; date: string } }) => {
      if (data.action === "update" && profile !== "superadmin") {
        if (data.status?.all === -1 && data.status?.this === -1) {
          toast.warning(t("importInProgress"));
        } else {
          toast.info(t("importProgress", { current: data.status?.this ?? 0, total: data.status?.all ?? 0, date: data.status?.date ?? "" }));
        }
      }
      if (data.action === "refresh" && profile !== "superadmin") {
        toast.error(t("importError"));
      }
    });

    socket.on(`${tenantId}:change_battery`, (data: { batteryInfo: { sessionName: string; battery: string } }) => {
      if (profile !== "superadmin") {
        toast.warning(t("lowBattery", { session: data.batteryInfo.sessionName, battery: data.batteryInfo.battery }));
      }
    });

    return () => {
      socket.off("connect", joinNotification);
      socket.off(`${tenantId}:importMessages`);
      socket.off(`${tenantId}:change_battery`);
      initialized.current = false;
    };
  }, [isAuthenticated, tenantId]);
}
