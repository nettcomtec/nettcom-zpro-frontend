"use client";

import { useEffect, useRef } from "react";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth-store";

export interface TicketSharedCreatePayload {
  id: number;
  ticketId: number;
  userId: number;
  userIdArray: number[];
}

export interface TicketSharedDeletePayload {
  id: number;
  ticketId: number;
  userIdArray: number[];
}

interface UseTicketSharedSocketOptions {
  onCreate?: (payload: TicketSharedCreatePayload) => void;
  onDelete?: (payload: TicketSharedDeletePayload) => void;
}

export function useTicketSharedSocket({ onCreate, onDelete }: UseTicketSharedSocketOptions = {}) {
  const { user, isAuthenticated } = useAuthStore();
  const tenantId = user?.tenantId;
  const userId = user?.userId;
  const onCreateRef = useRef(onCreate);
  const onDeleteRef = useRef(onDelete);
  onCreateRef.current = onCreate;
  onDeleteRef.current = onDelete;

  useEffect(() => {
    if (!isAuthenticated || !tenantId || !userId) return;

    const socket = getSocket();
    if (!socket) return;

    const event = `${tenantId}:ticketList`;
    const handler = (msg: { type: string; payload: TicketSharedCreatePayload | TicketSharedDeletePayload }) => {
      if (!msg || typeof msg !== "object") return;
      const involvesUser = Array.isArray(msg.payload?.userIdArray) && msg.payload.userIdArray.includes(userId);
      if (!involvesUser) return;
      if (msg.type === "ticketShared:create") onCreateRef.current?.(msg.payload as TicketSharedCreatePayload);
      else if (msg.type === "ticketShared:delete") onDeleteRef.current?.(msg.payload as TicketSharedDeletePayload);
    };

    socket.on(event, handler);
    return () => {
      socket.off(event, handler);
    };
  }, [isAuthenticated, tenantId, userId]);
}
