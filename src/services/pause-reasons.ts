import api from "@/lib/api";

export interface PauseReason {
  id: number;
  name: string;
  color?: string | null;
  // Limites (enforcement na Fase 2; ja expostos para cadastro)
  maxDurationMinutes?: number | null;
  maxUsesPerDay?: number | null;
  alertOnOverflow?: boolean;
  isActive?: boolean;
  tenantId?: number;
}

// Lista motivos de pausa do tenant. onlyActive=true filtra os ativos (usado no
// picker de pausa do operador); admin lista todos para gerir.
export async function fetchPauseReasons(
  onlyActive = false
): Promise<{ data: PauseReason[] }> {
  return api.get("/pauseReasons", {
    params: onlyActive ? { onlyActive: true } : {},
  });
}

export async function createPauseReason(data: Partial<PauseReason>) {
  return api.post("/pauseReasons", data);
}

export async function updatePauseReason(
  reasonId: number,
  data: Partial<PauseReason>
) {
  return api.put(`/pauseReasons/${reasonId}`, data);
}

export async function deletePauseReason(reasonId: number) {
  return api.delete(`/pauseReasons/${reasonId}`);
}
