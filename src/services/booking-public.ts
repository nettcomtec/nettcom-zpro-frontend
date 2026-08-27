import axios from "axios";

/*
 * Client do PORTAL PÚBLICO (/agendar/[slug]).
 *
 * §10.D: NÃO usar o `@/lib/api` compartilhado — ele injeta Authorization: Bearer
 * automaticamente e redireciona para /login (401/403) e billing (402). O visitante
 * público não tem sessão. Aqui usamos um axios ISOLADO, sem interceptors.
 */
const publicClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3101"
});

export interface PublicBookingFormField {
  id: number;
  label: string;
  type: "text" | "textarea" | "select" | "email" | "phone";
  required: boolean;
  options?: string[] | null;
}

export interface PublicProfessional {
  id: number;
  name: string;
  color?: string | null;
}

export interface PublicEventType {
  id: number;
  name: string;
  description?: string | null;
  durationMinutes: number;
  price?: number | null;
  locationType: string;
  color?: string | null;
  capacity?: number;
  capacityScope?: "per_professional" | "shared";
  professionalIds?: number[];
  formFields: PublicBookingFormField[];
}

export interface PublicBookingPage {
  page: {
    slug: string;
    title: string;
    description?: string | null;
    timezone: string;
    logoUrl?: string | null;
    primaryColor?: string | null;
    welcomeMessage?: string | null;
  };
  professionals: PublicProfessional[];
  eventTypes: PublicEventType[];
}

export interface PublicSlot {
  start: string; // ISO UTC
  end: string;
  remaining?: number; // vagas restantes (turma/grupo)
  capacity?: number;
  professionalId?: number;
  professionalName?: string;
}

export async function getPublicBookingPage(slug: string): Promise<PublicBookingPage> {
  const { data } = await publicClient.get(`/public/booking/${encodeURIComponent(slug)}`);
  return data;
}

export async function getPublicSlots(
  slug: string,
  eventTypeId: number,
  params?: { from?: string; to?: string; professionalId?: number }
): Promise<{ timezone: string; slots: PublicSlot[] }> {
  const { data } = await publicClient.get(
    `/public/booking/${encodeURIComponent(slug)}/${eventTypeId}/slots`,
    { params }
  );
  return data;
}

export interface CreatePublicBookingPayload {
  startAt: string;
  name: string;
  phone: string;
  email?: string;
  formAnswers?: Record<string, unknown>;
  professionalId?: number;
}

export interface PublicBookingResult {
  id: number;
  title: string;
  startAt: string;
  endAt: string;
  status: string;
  location?: string | null;
  meetingLink?: string | null;
  cancelToken: string;
}

export async function createPublicBooking(
  slug: string,
  eventTypeId: number,
  payload: CreatePublicBookingPayload
): Promise<PublicBookingResult> {
  const { data } = await publicClient.post(
    `/public/booking/${encodeURIComponent(slug)}/${eventTypeId}`,
    payload
  );
  return data;
}

// --- Gerenciamento por token (F5) ---

export interface ManageBooking {
  id: number;
  title: string;
  startAt: string;
  endAt: string;
  status: string;
  location?: string | null;
  meetingLink?: string | null;
  contactName?: string;
  slug?: string;
  eventTypeId?: number;
  durationMinutes?: number;
  timezone?: string;
  page?: { title: string; logoUrl?: string | null; primaryColor?: string | null } | null;
}

export async function getManageBooking(token: string): Promise<ManageBooking> {
  const { data } = await publicClient.get(`/public/booking/manage/${encodeURIComponent(token)}`);
  return data;
}

export async function cancelManageBooking(token: string): Promise<{ status: string }> {
  const { data } = await publicClient.post(`/public/booking/manage/${encodeURIComponent(token)}/cancel`);
  return data;
}

export async function rescheduleManageBooking(token: string, startAt: string): Promise<{ startAt: string; status: string }> {
  const { data } = await publicClient.post(`/public/booking/manage/${encodeURIComponent(token)}/reschedule`, { startAt });
  return data;
}
