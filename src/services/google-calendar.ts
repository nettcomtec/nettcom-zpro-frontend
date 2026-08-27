import api, { BACKGROUND_REQUEST } from "@/lib/api";

export interface GoogleCalendarConfig {
  id: number;
  name: string;
  googleClientId: string;
  googleClientSecret: string;
  googleAccessToken?: string;
  googleRefreshToken?: string;
  isActive: boolean;
  // Agenda padrao do tenant — usada pelo link do Meet e pelo agendamento
  // publico quando nenhuma agenda especifica foi escolhida.
  isDefault?: boolean;
  createdAt?: string;
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
  status?: string;
  htmlLink?: string;
  attendees?: string[];
  // Phase 16 — campos extras vindos do backend
  meetLink?: string;
  eventType?: string;
  isReadOnly?: boolean;
  calendarId?: string;
  calendarName?: string;
}

export async function listGoogleCalendarConfigs(options?: { background?: boolean }) {
  return api.get<{ configs: GoogleCalendarConfig[] }>(
    "/google-calendar-configs",
    options?.background ? { ...BACKGROUND_REQUEST } : undefined
  );
}

export async function createGoogleCalendarConfig(data: Record<string, unknown>) {
  return api.post<GoogleCalendarConfig>("/google-calendar-configs", data);
}

export async function updateGoogleCalendarConfig(id: number, data: Record<string, unknown>) {
  return api.put<GoogleCalendarConfig>(`/google-calendar-configs/${id}`, data);
}

export async function deleteGoogleCalendarConfig(id: number) {
  return api.delete(`/google-calendar-configs/${id}`);
}

export async function setDefaultGoogleCalendarConfig(id: number) {
  return api.put<GoogleCalendarConfig>(`/google-calendar-configs/${id}`, { isDefault: true });
}

export interface CalendarOfAccount {
  id: string;
  name: string;
  primary: boolean;
  canWrite: boolean;
}

// Calendarios existentes DENTRO de uma conta conectada (Trabalho, Pessoal...).
export async function listCalendarsOfConfig(id: number, options?: { background?: boolean }) {
  return api.get<{ calendars: CalendarOfAccount[] }>(
    `/google-calendar-configs/${id}/calendars`,
    options?.background ? { ...BACKGROUND_REQUEST } : undefined
  );
}

export async function generateGoogleAuthUrl(data: { clientId: string; clientSecret: string; state?: string }) {
  return api.post<{ authUrl: string }>("/google-calendar/auth/url", data);
}

export async function listGoogleCalendarEvents(
  params: { timeMin?: string; timeMax?: string; maxResults?: number; googleCalendarId?: string },
  data: Record<string, unknown>
) {
  return api.post<{ events: GoogleCalendarEvent[] }>("/google-calendar-list/events", data, { params });
}

export async function createGoogleCalendarEvent(data: Record<string, unknown>) {
  return api.post<GoogleCalendarEvent>("/google-calendar-create/events", data);
}

export async function updateGoogleCalendarEvent(eventId: string, data: Record<string, unknown>) {
  return api.put<GoogleCalendarEvent>(`/google-calendar-update/events/${eventId}`, data);
}

export async function deleteGoogleCalendarEvent(eventId: string, data: Record<string, unknown>) {
  return api.delete(`/google-calendar-delete/events/${eventId}`, { data });
}

export async function createGoogleMeetLink() {
  return api.post<{ meetLink: string }>("/google-calendar/meet-link");
}
