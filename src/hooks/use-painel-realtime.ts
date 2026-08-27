"use client";

// Realtime do Painel de Atendimentos (/painel-atendimentos).
//
// Escuta o canal tenant-wide `${tenantId}:ticketList` (o MESMO que a lista de
// atendimento consome) e dispara um refetch DEBOUNCED do endpoint do painel.
// Não recalcula estado no cliente: o backend re-aplica escopo/permissão/agrupamento
// (server-authoritative), então basta re-buscar quando algo muda.
//
// Cuidados aprendidos na auditoria:
// - SEMPRE remover o listener pelo handler específico (`off(channel, handler)`),
//   NUNCA `off(channel)` sem handler — o socket é um singleton compartilhado e
//   isso derrubaria os listeners globais de ticket (lista do /atendimento).
// - Gatilho inclui `ticket:update` porque tickets de 1º contato (novo pendente)
//   chegam como `ticket:update`, não `ticket:create`.
// - Debounce com maxWait: sob fluxo contínuo de eventos um debounce puro nunca
//   "assenta"; o maxWait garante ao menos um refetch a cada ~4s.
// - onRefresh vem por ref estável para não re-registrar o listener a cada
//   mudança de filtro/estado da página.

import { useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/auth-store";

// Tipos de evento que alteram contagem/status/posição de um ticket no painel.
// `chat:create`/`chat:ack` (alta frequência) ficam de fora de propósito: preview
// e não-lidas são reconciliados pela rede de segurança periódica da página, o que
// evita um refetch por mensagem em operação movimentada.
const REFRESH_TYPES = new Set<string>([
  "ticket:create",
  "ticket:update",
  "ticket:delete",
  "notification:new",
]);

const DEBOUNCE_MS = 1200; // coalesce rajadas de eventos
const MAX_WAIT_MS = 4000; // teto: garante progresso sob fluxo contínuo
const RECONNECT_DOWNTIME_THRESHOLD_MS = 10_000;

interface UsePainelRealtimeOptions {
  /** Só escuta/atualiza quando true (modo Ao Vivo, aba ativa, sem ação em massa). */
  enabled: boolean;
  /** Chamado (debounced) quando chega um evento relevante ou após reconexão. */
  onRefresh: () => void;
}

export interface PainelRealtimeState {
  connected: boolean;
  reconnecting: boolean;
}

export function usePainelRealtime({
  enabled,
  onRefresh,
}: UsePainelRealtimeOptions): PainelRealtimeState {
  const { user, isAuthenticated } = useAuthStore();
  const tenantId = user?.tenantId;

  // Ref estável do callback: mantém sempre o mais recente sem entrar nas deps
  // do efeito (senão o listener seria re-registrado a cada render).
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    if (!enabled || !isAuthenticated || !tenantId) return;

    const socket = getSocket();
    const channel = `${tenantId}:ticketList`;

    setConnected(socket.connected);
    setReconnecting(false);

    // --- Debounce com maxWait ---
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let firstEventAt: number | null = null;
    const runRefresh = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      firstEventAt = null;
      onRefreshRef.current();
    };
    const schedule = () => {
      const now = Date.now();
      if (firstEventAt === null) firstEventAt = now;
      if (debounceTimer) clearTimeout(debounceTimer);
      const wait = Math.min(DEBOUNCE_MS, Math.max(0, MAX_WAIT_MS - (now - firstEventAt)));
      debounceTimer = setTimeout(runRefresh, wait);
    };

    const handleTicketList = (data: { type?: string }) => {
      if (data?.type && REFRESH_TYPES.has(data.type)) schedule();
    };

    // --- Conexão / reconexão ---
    const onConnect = () => {
      setConnected(true);
      setReconnecting(false);
    };
    const onDisconnect = () => setConnected(false);

    let disconnectedAt: number | null = null;
    const onReconnectAttempt = () => {
      setReconnecting(true);
      if (disconnectedAt === null) disconnectedAt = Date.now();
    };
    const onReconnect = () => {
      const downtime = disconnectedAt ? Date.now() - disconnectedAt : 0;
      disconnectedAt = null;
      setConnected(true);
      setReconnecting(false);
      // Queda relevante pode ter perdido deltas — força refetch autoritativo.
      if (!(downtime > 0 && downtime < RECONNECT_DOWNTIME_THRESHOLD_MS)) runRefresh();
    };

    socket.on(channel, handleTicketList);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.io.on("reconnect_attempt", onReconnectAttempt);
    socket.io.on("reconnect", onReconnect);

    return () => {
      socket.off(channel, handleTicketList);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
      socket.io.off("reconnect", onReconnect);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [enabled, isAuthenticated, tenantId]);

  return { connected, reconnecting };
}
