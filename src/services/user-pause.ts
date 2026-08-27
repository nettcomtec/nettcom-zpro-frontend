import api from "@/lib/api";
import type { PauseReason } from "./pause-reasons";

// Sessao de pausa ATIVA do operador (ou null). scopeAllQueues=false => queueIds traz
// as filas pausadas. Pausado para de RECEBER tickets novos via roteamento automatico,
// mas mantem os em andamento e segue online.
export interface ActivePauseSession {
  id: number;
  userId: number;
  tenantId: number;
  pauseReasonId: number | null;
  pauseReason?: PauseReason | null;
  scopeAllQueues: boolean;
  startedAt: string;
  endedAt: string | null;
  // Fase 2: estouro de tempo (setado pelo job de overflow)
  overflowedAt?: string | null;
  overflowNotifiedAt?: string | null;
  durationSeconds?: number | null;
  queueIds: number[];
}

export interface StartPausePayload {
  pauseReasonId: number;
  scopeAllQueues: boolean;
  // obrigatorio quando scopeAllQueues = false
  queueIds?: number[];
}

export async function fetchMyActivePause(): Promise<{
  data: ActivePauseSession | null;
}> {
  return api.get("/userPause/me");
}

export async function startUserPause(payload: StartPausePayload) {
  return api.post("/userPause", payload);
}

export async function endUserPause() {
  return api.post("/userPause/end");
}

// ── Fase 3: relatorio de pausas (gestao) ──────────────────────────────────────
export interface PauseReportSession {
  id: number;
  userId: number;
  userName: string;
  reasonId: number | null;
  reasonName: string | null;
  reasonColor: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  active: boolean;
  overflowed: boolean;
  scopeAllQueues: boolean;
}

export interface PauseReportReasonAgg {
  reasonId: number | null;
  reasonName: string | null;
  reasonColor: string | null;
  count: number;
  durationSeconds: number;
  overflowCount: number;
}

export interface PauseReportUser {
  userId: number;
  userName: string;
  totalSessions: number;
  totalDurationSeconds: number;
  overflowCount: number;
  reasons: PauseReportReasonAgg[];
}

export interface PauseReport {
  range: { start: string; end: string };
  sessions: PauseReportSession[];
  byUser: PauseReportUser[];
}

export async function fetchPauseReport(params: {
  startDate?: string;
  endDate?: string;
  userId?: number;
}): Promise<{ data: PauseReport }> {
  return api.get("/userPause/report", { params });
}
