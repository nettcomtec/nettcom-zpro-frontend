import api from "@/lib/api";

export interface ScheduleAppointment {
  id: number;
  title: string;
  description?: string;
  contactId?: number | null;
  contact?: { id: number; name: string; number: string } | null;
  contactName?: string;
  contactPhone?: string;
  whatsappId?: number | null;
  whatsapp?: { id: number; name: string; type: string } | null;
  tenantId?: number;
  startAt: string;
  endAt?: string | null;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
  checkInStatus?: "none" | "confirmed" | "on_the_way" | "no_show";
  notes?: string;
  source?: "manual" | "public";
  // Respostas do formulário público, já rotuladas pelo backend (só em reservas públicas).
  formAnswersList?: { label: string; value: string }[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ScheduleReminder {
  id: number;
  name: string;
  description?: string;
  hoursBeforeEvent: number;
  messageType: "message" | "waba_template";
  messageContent?: string;
  whatsappId?: number | null;
  whatsapp?: { id: number; name: string; type: string } | null;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// --- Appointments ---

export interface AppointmentsPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface FetchAppointmentsParams {
  page?: number;
  limit?: number;
  status?: string;
  startFrom?: string;
  startTo?: string;
  search?: string;
  order?: "asc" | "desc";
}

export async function fetchAppointments(params?: FetchAppointmentsParams) {
  const res = await api.get("/schedule-appointments", { params });
  const data = res.data?.data ?? (Array.isArray(res.data) ? res.data : []);
  return {
    data: (Array.isArray(data) ? data : []) as ScheduleAppointment[],
    pagination: res.data?.pagination as AppointmentsPagination | undefined,
  };
}

// Teto de páginas do calendário: 20 páginas × limite pedido. Existe só para um mês
// absurdamente cheio não virar loop infinito de requisições — quando bate no teto o
// retorno vem com `truncated`, que a tela mostra ao usuário (nunca cortar calado).
const RANGE_MAX_PAGES = 20;

// Busca TODAS as consultas de um intervalo, paginando até acabar. O limite por página
// é só otimização de round-trip: quem manda no laço é o `totalPages` que o backend
// devolve, então instalação com backend antigo (que corta o limit em 200) completa as
// páginas normalmente em vez de perder o resto do mês.
export async function fetchAppointmentsRange(params: {
  startFrom: string;
  startTo: string;
  limit?: number;
}): Promise<{ data: ScheduleAppointment[]; truncated: boolean }> {
  const limit = params.limit ?? 500;
  const all: ScheduleAppointment[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const { data, pagination } = await fetchAppointments({
      page,
      limit,
      startFrom: params.startFrom,
      startTo: params.startTo,
    });
    all.push(...data);
    totalPages = pagination?.totalPages ?? 1;
    // Backend sem paginação (ou página vazia) — não há como avançar com segurança.
    if (!pagination || data.length === 0) break;
    page += 1;
  } while (page <= totalPages && page <= RANGE_MAX_PAGES);

  return { data: all, truncated: totalPages > RANGE_MAX_PAGES };
}

export async function fetchAppointment(id: number) {
  const res = await api.get(`/schedule-appointments/${id}`);
  return res.data as ScheduleAppointment;
}

export async function createAppointment(data: Partial<ScheduleAppointment>) {
  const res = await api.post("/schedule-appointments", data);
  return res.data as ScheduleAppointment;
}

export async function updateAppointment(id: number, data: Partial<ScheduleAppointment>) {
  const res = await api.put(`/schedule-appointments/${id}`, data);
  return res.data as ScheduleAppointment;
}

export async function deleteAppointment(id: number) {
  await api.delete(`/schedule-appointments/${id}`);
}

// --- Reminder Rules ---

export async function fetchReminders() {
  const res = await api.get("/schedule-reminders");
  const data = res.data?.data ?? (Array.isArray(res.data) ? res.data : []);
  return Array.isArray(data) ? (data as ScheduleReminder[]) : [];
}

export async function createReminder(data: Partial<ScheduleReminder>) {
  const res = await api.post("/schedule-reminders", data);
  return res.data as ScheduleReminder;
}

export async function updateReminder(id: number, data: Partial<ScheduleReminder>) {
  const res = await api.put(`/schedule-reminders/${id}`, data);
  return res.data as ScheduleReminder;
}

export async function deleteReminder(id: number) {
  await api.delete(`/schedule-reminders/${id}`);
}

export async function toggleReminder(id: number) {
  const res = await api.put(`/schedule-reminders/${id}/toggle-active`);
  return res.data as ScheduleReminder;
}
