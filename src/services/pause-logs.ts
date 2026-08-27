import api from "@/lib/api";

export interface PauseLog {
  id: number;
  ticketId: number;
  userId: number;
  tenantId: number;
  pauseReason: string | null;
  pausedAt: number;
  resumedAt: number | null;
  createdAt: string;
  user?: { id: number; name: string };
}

export async function fetchPauseLogs(ticketId: number) {
  return api.get<PauseLog[]>(`/ticketPauseLogs/${ticketId}/logs`);
}
