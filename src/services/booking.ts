import api from "@/lib/api";

// F1 — config interna (autenticada) do agendamento público. As chamadas do PORTAL
// público (F2) usarão um client separado, sem token de auth (ver §10.D).

export interface BookingEventTypeLite {
  id: number;
  name: string;
  isActive: boolean;
  durationMinutes: number;
}

export interface BookingPage {
  id: number;
  tenantId?: number;
  slug: string;
  title: string;
  description?: string | null;
  isActive: boolean;
  timezone: string;
  whatsappId?: number | null;
  whatsapp?: { id: number; name: string; type: string } | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  welcomeMessage?: string | null;
  confirmationHeader?: string | null;
  // Agenda Google desta pagina (null = usa a agenda padrao do tenant) e qual
  // calendario dentro dessa conta (null = calendario principal).
  googleCalendarConfigId?: number | null;
  googleCalendarId?: string | null;
  checkInMinutesBefore?: number;
  checkInMessage?: string | null;
  eventTypes?: BookingEventTypeLite[];
  createdAt?: string;
  updatedAt?: string;
}

export type BookingLocationType = "in_person" | "online" | "phone" | "custom";

export interface BookingEventType {
  id: number;
  tenantId?: number;
  bookingPageId: number;
  name: string;
  description?: string | null;
  isActive: boolean;
  color?: string | null;
  durationMinutes: number;
  slotIntervalMinutes: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeMinutes: number;
  maxDaysAhead: number;
  maxPerDay?: number | null;
  capacity?: number;
  maxPerDayMode?: "attendees" | "slots";
  capacityScope?: "per_professional" | "shared";
  locationType: BookingLocationType;
  locationDetails?: string | null;
  meetingLink?: string | null;
  userId?: number | null;
  queueId?: number | null;
  price?: number | null;
  confirmationMessage?: string | null;
  confirmationTemplate?: string | null;
  autoConfirm: boolean;
  professionalIds?: number[];
  availabilities?: BookingAvailability[];
  formFields?: BookingFormField[];
  dateOverrides?: BookingDateOverride[];
  createdAt?: string;
  updatedAt?: string;
}

export interface BookingAvailability {
  id?: number;
  bookingEventTypeId?: number;
  weekday: number;
  startTime: string;
  endTime: string;
}

export type BookingFieldType = "text" | "textarea" | "select" | "email" | "phone";

export interface BookingFormField {
  id?: number;
  bookingEventTypeId?: number;
  label: string;
  type: BookingFieldType;
  required: boolean;
  options?: string[] | null;
  order: number;
}

export interface BookingDateOverride {
  id?: number;
  bookingEventTypeId?: number;
  date: string;
  isClosed: boolean;
  startTime?: string | null;
  endTime?: string | null;
}

export interface ProfessionalWorkingHour {
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface BookingProfessional {
  id: number;
  tenantId?: number;
  bookingPageId: number;
  userId?: number | null;
  name: string;
  isActive: boolean;
  color?: string | null;
  order: number;
  workingHours: ProfessionalWorkingHour[];
  // Agenda Google do profissional (null = nao consulta o Google para ele) e
  // qual calendario dentro dessa conta (null = calendario principal).
  googleCalendarConfigId?: number | null;
  googleCalendarId?: string | null;
}

// ── Booking pages ────────────────────────────────────────────────────────────

export async function fetchBookingPages(): Promise<BookingPage[]> {
  const res = await api.get("/booking-pages");
  const data = res.data?.data ?? (Array.isArray(res.data) ? res.data : []);
  return Array.isArray(data) ? data : [];
}

export async function fetchBookingPage(id: number): Promise<BookingPage> {
  const res = await api.get(`/booking-pages/${id}`);
  return res.data as BookingPage;
}

export async function checkBookingSlug(slug: string, excludeId?: number): Promise<{ available: boolean; slug: string }> {
  const res = await api.get("/booking-pages/check-slug", { params: { slug, excludeId } });
  return res.data;
}

export async function createBookingPage(data: Partial<BookingPage>): Promise<BookingPage> {
  const res = await api.post("/booking-pages", data);
  return res.data as BookingPage;
}

export async function updateBookingPage(id: number, data: Partial<BookingPage>): Promise<BookingPage> {
  const res = await api.put(`/booking-pages/${id}`, data);
  return res.data as BookingPage;
}

export async function deleteBookingPage(id: number): Promise<void> {
  await api.delete(`/booking-pages/${id}`);
}

// ── Event types ──────────────────────────────────────────────────────────────

export async function fetchBookingEventTypes(bookingPageId?: number): Promise<BookingEventType[]> {
  const res = await api.get("/booking-event-types", { params: { bookingPageId } });
  const data = res.data?.data ?? (Array.isArray(res.data) ? res.data : []);
  return Array.isArray(data) ? data : [];
}

export async function fetchBookingEventType(id: number): Promise<BookingEventType> {
  const res = await api.get(`/booking-event-types/${id}`);
  return res.data as BookingEventType;
}

export async function createBookingEventType(data: Partial<BookingEventType>): Promise<BookingEventType> {
  const res = await api.post("/booking-event-types", data);
  return res.data as BookingEventType;
}

export async function updateBookingEventType(id: number, data: Partial<BookingEventType>): Promise<BookingEventType> {
  const res = await api.put(`/booking-event-types/${id}`, data);
  return res.data as BookingEventType;
}

export async function deleteBookingEventType(id: number): Promise<void> {
  await api.delete(`/booking-event-types/${id}`);
}

export async function setBookingAvailability(eventTypeId: number, availabilities: BookingAvailability[]): Promise<BookingAvailability[]> {
  const res = await api.put(`/booking-event-types/${eventTypeId}/availability`, { availabilities });
  return res.data?.data ?? [];
}

export async function setBookingFormFields(eventTypeId: number, formFields: BookingFormField[]): Promise<BookingFormField[]> {
  const res = await api.put(`/booking-event-types/${eventTypeId}/form-fields`, { formFields });
  return res.data?.data ?? [];
}

export async function fetchBookingDateOverrides(eventTypeId: number): Promise<BookingDateOverride[]> {
  const res = await api.get(`/booking-event-types/${eventTypeId}/date-overrides`);
  return res.data?.data ?? [];
}

export async function createBookingDateOverride(eventTypeId: number, data: Partial<BookingDateOverride>): Promise<BookingDateOverride> {
  const res = await api.post(`/booking-event-types/${eventTypeId}/date-overrides`, data);
  return res.data as BookingDateOverride;
}

export async function deleteBookingDateOverride(overrideId: number): Promise<void> {
  await api.delete(`/booking-date-overrides/${overrideId}`);
}

// --- Professionals (F6) ---

export async function fetchBookingProfessionals(bookingPageId?: number): Promise<BookingProfessional[]> {
  const res = await api.get("/booking-professionals", { params: { bookingPageId } });
  const data = res.data?.data ?? (Array.isArray(res.data) ? res.data : []);
  return Array.isArray(data) ? data : [];
}

export async function createBookingProfessional(data: Partial<BookingProfessional>): Promise<BookingProfessional> {
  const res = await api.post("/booking-professionals", data);
  return res.data as BookingProfessional;
}

export async function updateBookingProfessional(id: number, data: Partial<BookingProfessional>): Promise<BookingProfessional> {
  const res = await api.put(`/booking-professionals/${id}`, data);
  return res.data as BookingProfessional;
}

export async function deleteBookingProfessional(id: number): Promise<void> {
  await api.delete(`/booking-professionals/${id}`);
}
