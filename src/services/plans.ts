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

export async function fetchPlans() {
  return api.get("/plan/");
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
