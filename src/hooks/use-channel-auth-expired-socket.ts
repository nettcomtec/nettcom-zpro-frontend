"use client";

import { useEffect, useRef } from "react";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth-store";

export type ChannelAuthExpiredService =
  | "mercadolivre"
  | "linkedin"
  | "tiktok"
  | "olx"
  | "waba"
  | "instagram"
  | "messenger";

export interface ChannelAuthExpiredPayload {
  service: ChannelAuthExpiredService;
  whatsappId: number;
  expiredAt: string;
}

interface UseChannelAuthExpiredOptions {
  onExpired?: (payload: ChannelAuthExpiredPayload) => void;
}

export function useChannelAuthExpiredSocket({ onExpired }: UseChannelAuthExpiredOptions = {}) {
  const { user, isAuthenticated } = useAuthStore();
  const tenantId = user?.tenantId;
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;

  useEffect(() => {
    if (!isAuthenticated || !tenantId) return;

    const socket = getSocket();
    if (!socket) return;

    const event = `${tenantId}:channel:auth-expired`;
    const handler = (payload: ChannelAuthExpiredPayload) => {
      onExpiredRef.current?.(payload);
    };

    socket.on(event, handler);
    return () => {
      socket.off(event, handler);
    };
  }, [isAuthenticated, tenantId]);
}
