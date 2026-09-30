import api from "@/lib/api";

export interface TodoItem {
  id: number;
  name: string;
  description?: string;
  comments?: string;
  status: "pending" | "delayed" | "finished" | string;
  priority?: "high" | "medium" | "low" | "none" | string;
  limitDate?: string;
  dueDate?: string; // alias
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
  owner?: string;
  ownerId?: number;
  recurrence?: number;
  recurrenceTimes?: number;
  contactId?: number | null;
  ticketId?: number | null;
  relationshipId?: number | null;
}

/** `contactId` (PLANO_CRM_CONTATO D19): só as tarefas vinculadas ao contato. Backend antigo ignora o filtro. */
export async function fetchTodoLists(params?: { contactId?: number }) {
  return api.get("/todoLists", params?.contactId ? { params: { contactId: params.contactId } } : undefined);
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
