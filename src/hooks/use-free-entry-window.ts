"use client";

// Janela grátis do anúncio (free entry point da Meta): docs/PLANO_JANELA_FEP_72H.md §4.
//
// Devolve o fim da janela (epoch ms, no relógio DESTE navegador) enquanto ela está aberta,
// ou null. O prazo vem do backend, que o copia do status da Meta; nada é calculado aqui.
// A janela grátis só diz QUANTO CUSTA: quem libera texto livre continua sendo a janela
// de 24h.
//
// Relógio: o backend manda `remainingMs` medido no relógio do SERVIDOR e o fim local é
// `agora + remainingMs`. Com relógio ou fuso errado na máquina (o "33h restantes" do
// plano §2), a data mostrada continua batendo com a hora de parede e o aviso não passa
// do prazo real. Some 15 min antes do fim: template em fila ou na rede não pode sair
// achando que é grátis.
//
// Tempo real: o backend emite `ticket:freeEntryWindow` no canal `${tenantId}:ticketList`.
// O ouvinte é `onAny` de propósito: `useSocketTickets`/`useSocketTicketsOtm` (montados pelo
// `useSocket()` do layout do dashboard, PAI da caixa de mensagem) fazem `socket.off(canal)`
// sem handler, e o efeito do pai roda depois do filho e de novo quando as dependências
// mudam: um `socket.on(canal, ...)` registrado aqui seria apagado. O `off(canal)` não
// toca o `onAny`.

import { useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth-store";
import { fetchTicketFreeEntryWindow } from "@/services/free-entry-window";

// Canais cujo status da Meta o backend lê (D2 do plano): WABA Meta e Dialog360.
const FREE_ENTRY_CHANNELS = new Set(["waba", "dialog360"]);
const SOCKET_EVENT_TYPE = "ticket:freeEntryWindow";
const SAFETY_MARGIN_MS = 15 * 60 * 1000;
// setTimeout estoura acima de ~24,8 dias; o prazo é de até 7, mas o re-render é por hora.
const MAX_TIMER_MS = 60 * 60 * 1000;

interface UseFreeEntryWindowOptions {
  ticketId?: number | null;
  channel?: string | null;
  contactId?: number | null;
  whatsappId?: number | null;
}

interface FreeEntryWindowEventPayload {
  ticketIds?: unknown[];
  contactId?: unknown;
  whatsappId?: unknown;
  expiresAt?: unknown;
  remainingMs?: unknown;
}

const toPositive = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Fim local da janela: `remainingMs` do servidor; sem ele (backend antigo), o prazo cru. */
const toLocalDeadline = (remainingMs: unknown, expiresAt: unknown): number => {
  const remaining = toPositive(remainingMs);
  if (remaining) return Date.now() + remaining;
  return toPositive(expiresAt);
};

export function supportsFreeEntryWindow(channel?: string | null): boolean {
  return FREE_ENTRY_CHANNELS.has(String(channel || "").toLowerCase());
}

export function useFreeEntryWindow({
  ticketId,
  channel,
  contactId,
  whatsappId,
}: UseFreeEntryWindowOptions): number | null {
  const tenantId = useAuthStore((s) => s.user?.tenantId);
  const supported = toPositive(ticketId) > 0 && supportsFreeEntryWindow(channel);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  const matchRef = useRef({ ticketId, contactId, whatsappId });
  matchRef.current = { ticketId, contactId, whatsappId };

  // Busca ao abrir o atendimento e quando o canal dele muda (transferido para outro
  // número não herda a janela). Backend antigo (404) ou falha = sem aviso.
  useEffect(() => {
    setDeadline(null);
    if (!supported || !ticketId) return;
    let cancelled = false;
    fetchTicketFreeEntryWindow(ticketId)
      .then(({ data }) => {
        if (cancelled) return;
        const local = toLocalDeadline(data?.remainingMs, data?.expiresAt);
        // O evento do socket pode chegar antes da resposta (leitura feita antes da gravação).
        setDeadline((prev) => Math.max(prev || 0, local) || null);
      })
      .catch(() => { /* sem a rota ou fora do ar: o aviso simplesmente não aparece */ });
    return () => { cancelled = true; };
  }, [supported, ticketId, whatsappId]);

  useEffect(() => {
    if (!supported || !tenantId) return;
    const socket = getSocket();
    const channelName = `${tenantId}:ticketList`;
    const listener = (eventName: string, data?: { type?: string; payload?: FreeEntryWindowEventPayload }) => {
      if (eventName !== channelName || data?.type !== SOCKET_EVENT_TYPE) return;
      const payload = data.payload || {};
      const current = matchRef.current;
      const currentWhatsapp = toPositive(current.whatsappId);
      const payloadWhatsapp = toPositive(payload.whatsappId);
      // O prazo é do número que enviou: canal diferente do atual nunca vale.
      if (currentWhatsapp > 0 && payloadWhatsapp > 0 && currentWhatsapp !== payloadWhatsapp) return;
      const currentTicket = toPositive(current.ticketId);
      const ids = Array.isArray(payload.ticketIds) ? payload.ticketIds : [];
      const sameTicket = currentTicket > 0 && ids.some((id) => toPositive(id) === currentTicket);
      const currentContact = toPositive(current.contactId);
      const sameContact =
        currentContact > 0 &&
        currentWhatsapp > 0 &&
        toPositive(payload.contactId) === currentContact &&
        payloadWhatsapp === currentWhatsapp;
      if (!sameTicket && !sameContact) return;
      const local = toLocalDeadline(payload.remainingMs, payload.expiresAt);
      if (!local) return;
      setDeadline((prev) => (prev && prev > local ? prev : local));
    };
    socket.onAny(listener);
    return () => { socket.offAny(listener); };
  }, [supported, tenantId]);

  // Re-render quando o aviso tem de sumir (15 min antes do fim).
  useEffect(() => {
    if (!deadline) return;
    const remaining = deadline - SAFETY_MARGIN_MS - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => setTick((t) => t + 1), Math.min(remaining + 500, MAX_TIMER_MS));
    return () => clearTimeout(timer);
  }, [deadline, tick]);

  return supported && deadline && deadline - SAFETY_MARGIN_MS > Date.now() ? deadline : null;
}
