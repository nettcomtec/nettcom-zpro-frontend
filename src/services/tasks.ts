import api, { BACKGROUND_REQUEST } from "@/lib/api";

export interface TodoItem {
  id: number;
  name: string;
  description?: string;
  comments?: string;
  status: "pending" | "delayed" | "finished" | string;
  priority?: "high" | "medium" | "low" | "none" | string;
  limitDate?: string;
  dueDate?: string; // alias
  /** PLANO_TAREFAS_ATENDIMENTO_LEMBRETES: true = prazo com hora (backend antigo não manda = dia inteiro) */
  limitHasTime?: boolean;
  /** Lembrete em minutos antes do prazo (0/10/30/60) ou null */
  reminderMinutes?: number | null;
  reminderAt?: string | null;
  owner?: string;
  ownerId?: number;
  recurrence?: number;
  recurrenceTimes?: number;
  userId?: number;
  user?: { id: number; name: string };
  /** PLANO_CRM_CONTATO D19: vínculos (backend antigo não manda) */
  contactId?: number | null;
  ticketId?: number | null;
  relationshipId?: number | null;
  contact?: { id: number; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface TodoPayload {
  name: string;
  description?: string;
  comments?: string;
  status?: string;
  priority?: string;
  limitDate?: string;
  /** Mandado SEMPRE junto com limitDate pela tela nova (decide dia inteiro × com hora). */
  limitHasTime?: boolean;
  reminderMinutes?: number | null;
  owner?: string;
  ownerId?: number;
  recurrence?: number;
  recurrenceTimes?: number;
  contactId?: number | null;
  ticketId?: number | null;
  relationshipId?: number | null;
}

/** `contactId` (PLANO_CRM_CONTATO D19): só as tarefas vinculadas ao contato. Backend antigo ignora o filtro. */
export async function fetchTodoLists(params?: { contactId?: number; mine?: boolean }) {
  const query: Record<string, string | number> = {};
  if (params?.contactId) query.contactId = params.contactId;
  // `mine` (aditivo): só as tarefas em que eu sou o responsável. Backend antigo ignora e devolve
  // a lista de antes — quem chama continua filtrando por ownerId no cliente.
  if (params?.mine) query.mine = 1;
  return api.get("/todoLists", Object.keys(query).length ? { params: query } : undefined);
}

export interface TodoSummary {
  overdue: number;
  today: number;
  items: TodoItem[];
  /** Backend com as colunas de hora/lembrete. */
  deadlineTimeSupported: boolean;
}

/**
 * PLANO_TAREFAS_ATENDIMENTO_LEMBRETES: resumo das MINHAS tarefas abertas (sino/menu).
 * `today` = AAAA-MM-DD local; `dayEnd` = ISO do fim do dia local. Backend antigo responde 404
 * (quem chama cai no caminho de antes).
 */
export async function fetchTodoSummary(params: { today: string; dayEnd: string }) {
  return api.get<TodoSummary>("/todoLists/summary", {
    params,
    ...BACKGROUND_REQUEST,
    skipNoPermissionToast: true
  });
}

export async function createTodoList(data: TodoPayload) {
  return api.post("/todoLists", data);
}

export async function updateTodoList(id: number, data: Partial<TodoPayload>) {
  return api.put(`/todoLists/${id}`, data);
}

export async function deleteTodoList(id: number) {
  return api.delete(`/todoLists/${id}`);
}

export async function fetchTodoListLogs(userId: number) {
  return api.get(`/todoLists/${userId}/logs`);
}
