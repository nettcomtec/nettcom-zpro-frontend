"use client";

import { useEffect, useRef } from "react";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth-store";

// Espelha o emit do backend em UpsertMetaPhoneHealthService:
//   io.to(`tenant:${tenantId}:notification`).emit(`${tenantId}:meta:quality:update`, {...})
// Dispara quando muda quality_rating / messaging_limit / phoneStatus (incl. BANNED/RESTRICTED)
// — seja por webhook account_update (tempo real) ou pelo pull periódico (6h).
export interface MetaQualityUpdatePayload {
  phoneHealthId?: number;
  phoneNumberId?: string;
  qualityRating?: string | null;
  messagingLimitTier?: string | null;
  phoneStatus?: string | null;
  accountReviewDecision?: string | null;
  lastChangeAt?: string | null;
}

export function useMetaPhoneHealthSocket(onUpdate?: (payload: MetaQualityUpdatePayload) => void) {
  const { user, isAuthenticated } = useAuthStore();
  const tenantId = user?.tenantId;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!isAuthenticated || !tenantId) return;

    const socket = getSocket();
    if (!socket) return;

    const event = `${tenantId}:meta:quality:update`;
    const handler = (payload: MetaQualityUpdatePayload) => {
      onUpdateRef.current?.(payload);
    };

    socket.on(event, handler);
    return () => {
      socket.off(event, handler);
    };
  }, [isAuthenticated, tenantId]);
}
