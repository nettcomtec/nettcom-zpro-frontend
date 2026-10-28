import api from "@/lib/api";

// Janela grátis do anúncio (free entry point da Meta): docs/PLANO_JANELA_FEP_72H.md §4.
// O prazo vem do status da Meta, gravado pelo backend; null = sem janela (ou aviso
// desligado pela empresa).
export interface TicketFreeEntryWindow {
  enabled: boolean;
  expiresAt: number | null;
  // Medido no relógio do servidor: a tela conta o prazo a partir dele.
  remainingMs?: number | null;
}

export interface FreeEntryWindowBannerInfo {
  freeEntryWindowBanner: "enabled" | "disabled";
  available: boolean;
}

export const fetchTicketFreeEntryWindow = (ticketId: number | string) =>
  api.get<TicketFreeEntryWindow>(`/ticketFreeEntryWindow/${ticketId}`);

export const fetchFreeEntryWindowBanner = (tenantId: number | string) =>
  api.get<FreeEntryWindowBannerInfo>(`/tenantsFreeEntryWindowBanner/${tenantId}`);
