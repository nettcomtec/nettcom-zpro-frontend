import api from "@/lib/api";
import type { PlanFeatures } from "@/lib/plan-capabilities";

export interface Plan {
  id: number;
  name: string;
  value: number;
  connections: number;
  users: number;
  isActive?: boolean;
  trial?: "enabled" | "disabled";
  trialPeriod?: number;
  createdAt?: string;
  /** Pacote vendido: { caps: { [key]: boolean }, limits: {...} }. */
  features?: PlanFeatures | null;
  description?: string;
  isPublic?: boolean;
  displayOrder?: number;
  highlight?: boolean;
}

/**
 * Lista de GESTÃO (tela /planos, só superadmin). Com `scope=admin` o backend exige login de
 * verdade e devolve a lista completa (planos ocultos e `features.limits`); token vencido
 * vira 401, que o interceptor renova e repete. Sem o marcador a rota é a pública da vitrine
 * e, com o token vencido, devolveria calada só os planos públicos sem os limites — e o
 * salvar gravaria o plano sem eles. Backend anterior ignora o parâmetro e devolve a lista
 * completa, como sempre. Vitrine e cadastro chamam `/plan/` direto, sem o marcador.
 */
export async function fetchPlans() {
  return api.get("/plan/", { params: { scope: "admin" } });
}

export async function createPlan(data: Partial<Plan>) {
  return api.post("/plan/", data);
}

export async function updatePlan(id: number, data: Partial<Plan>) {
  return api.put(`/plan/${id}`, data);
}

export async function deletePlan(id: number) {
  return api.delete(`/plan/${id}`);
}
