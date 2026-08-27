"use client";

import { useEffect, useRef } from "react";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth-store";

interface GoogleAuthExpiredPayload {
  service: "calendar" | "gmail" | "youtube";
  expiredAt: string;
  // gmail/youtube: id do canal Whatsapp pra auto-disparar OAuth no /sessoes
  whatsappId?: number;
}

interface UseGoogleAuthExpiredOptions {
  onExpired?: (payload: GoogleAuthExpiredPayload) => void;
}

export function useGoogleAuthExpiredSocket({ onExpired }: UseGoogleAuthExpiredOptions = {}) {
  const { user, isAuthenticated } = useAuthStore();
  const tenantId = user?.tenantId;
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;

  useEffect(() => {
    if (!isAuthenticated || !tenantId) return;

    const socket = getSocket();
    if (!socket) return;

    const event = `${tenantId}:google:auth-expired`;
    const handler = (payload: GoogleAuthExpiredPayload) => {
      onExpiredRef.current?.(payload);
    };

    socket.on(event, handler);
    return () => {
      socket.off(event, handler);
    };
  }, [isAuthenticated, tenantId]);
}
