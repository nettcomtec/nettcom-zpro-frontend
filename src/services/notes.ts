import api from "@/lib/api";

export interface TicketNote {
  id: number;
  content: string;
  ticketId: number;
  userId: number;
  user?: { id: number; name: string };
  ticket?: { id: number };
  mediaUrl?: string;
  tenantId?: number | string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketNotePayload {
  content: string;
  ticketId: number;
  idFront?: string;
  file?: File;
}

export async function fetchTicketNotes(params?: { ticketId?: number }) {
  return api.get("/ticketNotes/", { params });
}

export async function createTicketNote(data: TicketNotePayload) {
  if (data.file) {
    const formData = new FormData();
    formData.append("notes", data.content);
    formData.append("ticketId", String(data.ticketId));
    if (data.idFront) formData.append("idFront", data.idFront);
    formData.append("medias", data.file);
    return api.post("/ticketNotes/", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  }
 // The legacy front sends `notes` + `idFront` to /ticketNotes/ (NOT /messages/)
  return api.post("/ticketNotes/", { notes: data.content, ticketId: data.ticketId, idFront: data.idFront });
}

export async function updateTicketNote(id: number, data: Partial<TicketNotePayload>) {
  return api.put(`/ticketNotes/${id}`, { notes: data.content, ticketId: data.ticketId });
}

export async function deleteTicketNote(id: number) {
  return api.delete(`/ticketNotes/${id}`);
}

export async function fetchTicketNoteLogs(ticketId: number) {
  return api.get(`/ticketNotes/${ticketId}/logs`);
}
