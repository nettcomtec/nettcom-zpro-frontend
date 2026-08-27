import api from "@/lib/api";
import { setQueueCache } from "@/lib/queue-cache";

export type BusinessHourType = "O" | "C" | "H";

export interface BusinessHour {
  day: number;
  label: string;
  type: BusinessHourType;
  hr1: string;
  hr2: string;
  hr3: string;
  hr4: string;
}

// Feature "Distribuicao Automatica por Fila": 4 campos editaveis + 1 read-only
// (lastDistributedUserId — estado interno do round-robin Sequential, vem do server).
export type DistributionPriority = "oldest" | "newest";
export type DistributionStrategy = "R" | "B" | "S";

export interface Queue {
  id: number;
  name: string;
  color: string;
  isActive?: boolean;
  messageBusinessHours?: string;
  businessHours?: BusinessHour[];
  autoDistributeEnabled?: boolean;
  maxOpenTicketsPerUser?: number;
  distributionPriority?: DistributionPriority;
  distributionStrategy?: DistributionStrategy;
  lastDistributedUserId?: number | null;
}

interface QueueApiResponse {
  id: number;
  queue?: string;
  name?: string;
  color?: string;
  isActive?: boolean;
  messageBusinessHours?: string;
  businessHours?: BusinessHour[];
  autoDistributeEnabled?: boolean;
  maxOpenTicketsPerUser?: number;
  distributionPriority?: DistributionPriority;
  distributionStrategy?: DistributionStrategy;
  lastDistributedUserId?: number | null;
  [key: string]: unknown;
}

function normalizeQueue(r: QueueApiResponse): Queue {
  return {
    id: r.id,
    name: r.name ?? r.queue ?? "",
    color: r.color ?? "#3B82F6",
    isActive: r.isActive ?? true,
    messageBusinessHours: r.messageBusinessHours ?? "",
    businessHours: r.businessHours,
    autoDistributeEnabled: r.autoDistributeEnabled ?? false,
    maxOpenTicketsPerUser: r.maxOpenTicketsPerUser ?? 8,
    distributionPriority: r.distributionPriority ?? "oldest",
    distributionStrategy: r.distributionStrategy ?? "B",
    lastDistributedUserId: r.lastDistributedUserId ?? null,
  };
}

export async function fetchQueues() {
  const { data } = await api.get<QueueApiResponse[] | Queue[]>("/queue");
  const arr = Array.isArray(data) ? data : [];
  const result = arr.map((q) =>
    typeof (q as Queue).name === "string" ? (q as Queue) : normalizeQueue(q as QueueApiResponse)
  );
  // Popula o cache global de filas (id -> {name,color}) para resolver a badge da
  // fila quando um emit de socket chega "magro" (so queueId). Ver lib/queue-cache.
  setQueueCache(result);
  return { data: result };
}

function buildAutoDistributePayload(data: Partial<Queue>) {
  // Feature "Distribuicao Automatica por Fila": so envia campos quando definidos
  // (mantem backward-compat com clientes antigos que nao mandam esses campos).
  return {
    ...(data.autoDistributeEnabled !== undefined && {
      autoDistributeEnabled: data.autoDistributeEnabled,
    }),
    ...(data.maxOpenTicketsPerUser !== undefined && {
      maxOpenTicketsPerUser: data.maxOpenTicketsPerUser,
    }),
    ...(data.distributionPriority !== undefined && {
      distributionPriority: data.distributionPriority,
    }),
    ...(data.distributionStrategy !== undefined && {
      distributionStrategy: data.distributionStrategy,
    }),
  };
}

export async function createQueue(data: Partial<Queue>) {
  const payload = {
    queue: data.name ?? "",
    color: data.color ?? "#3B82F6",
    isActive: data.isActive ?? true,
    messageBusinessHours: data.messageBusinessHours ?? "",
    businessHours: data.businessHours ?? [],
    ...buildAutoDistributePayload(data),
  };
  return api.post("/queue", payload);
}

export async function updateQueue(queueId: number, data: Partial<Queue>) {
  const payload = {
    queue: data.name ?? "",
    color: data.color ?? "#3B82F6",
    isActive: data.isActive ?? true,
    messageBusinessHours: data.messageBusinessHours ?? "",
    businessHours: data.businessHours ?? [],
    ...buildAutoDistributePayload(data),
  };
  return api.put(`/queue/${queueId}`, payload);
}

export async function deleteQueue(queueId: number) {
  return api.delete(`/queue/${queueId}`);
}
