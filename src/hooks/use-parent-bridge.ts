"use client";

import { useEffect } from "react";

/**
 * Ponte iframe -> parent para o Fullchat embutido.
 *
 * Uso no componente (depois de ter o `ticket`):
 *   useParentBridge(ticket);
 *
 * Emite DOIS tipos de mensagem:
 *   - "fullchat:open"          -> módulo Odoo nettcom_fullchat (NÃO remover)
 *   - "fullchat:conversation"  -> contrato do SaaS clínica
 *
 * Origem de destino:
 *   - Por padrão emite para QUALQUER domínio ("*"), como o código inline antigo.
 *   - Para restringir, preencha ALLOWED_PARENT_ORIGINS com os domínios que
 *     embutem o Fullchat. Com a lista preenchida, só essas origens recebem.
 */

// VAZIO = emite para "*" (qualquer domínio). Preencha para restringir.
const ALLOWED_PARENT_ORIGINS: string[] = [];

type BridgeTicket = {
  id?: number | string;
  contact?: { number?: string; name?: string; id?: number | string } | null;
} | null | undefined;

/** Lista vazia => "*" (qualquer). Preenchida => restringe. */
function resolveTargetOrigins(): string[] {
  if (ALLOWED_PARENT_ORIGINS.length === 0) return ["*"];
  try {
    if (document.referrer) {
      const ref = new URL(document.referrer).origin;
      if (ALLOWED_PARENT_ORIGINS.includes(ref)) return [ref];
    }
  } catch {
    /* referrer ausente/inválido */
  }
  return ALLOWED_PARENT_ORIGINS;
}

function postToParent(payload: Record<string, unknown>) {
  if (typeof window === "undefined" || window.parent === window) return;
  for (const origin of resolveTargetOrigins()) {
    window.parent.postMessage(payload, origin);
  }
}

function buildPayloads(ticket: BridgeTicket) {
  const number = ticket?.contact?.number;
  if (!number) return null;
  const base = {
    number,
    ticketId: ticket?.id,
    name: ticket?.contact?.name,
    contactId: ticket?.contact?.id,
  };
  return [
    // Odoo (legado) — formato que o nettcom_fullchat já lê.
    { type: "fullchat:open", ...base },
    // SaaS clínica — ticketId é a chave; number/name são fallback.
    {
      type: "fullchat:conversation",
      conversationId: ticket?.id,
      contactPhone: number,
      contactName: ticket?.contact?.name,
      contactId: ticket?.contact?.id,
      // IMPORTANTE p/ o Odoo (nettcom_fullchat): o handler trata QUALQUER
      // "fullchat:*" como foco e ZERA o painel se a msg não tiver `number`
      // (regra `if (!number)` do attendance.js). Como emitimos para "*", esta
      // msg também chega lá; incluir number/ticketId faz ela reafirmar o mesmo
      // contato em vez de limpar. O clinic ignora estes extras.
      number,
      ticketId: ticket?.id,
    },
  ];
}

export function useParentBridge(ticket: BridgeTicket) {
  const ticketId = ticket?.id;
  const contactNumber = ticket?.contact?.number;

  // Emite ao abrir/trocar de conversa.
  useEffect(() => {
    const payloads = buildPayloads(ticket);
    if (!payloads) return;
    for (const p of payloads) postToParent(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId, contactNumber]);

  // Handshake: parent recarregou e pediu o estado atual -> reemite.
  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;
    const onMessage = (event: MessageEvent) => {
      if (
        ALLOWED_PARENT_ORIGINS.length > 0 &&
        !ALLOWED_PARENT_ORIGINS.includes(event.origin)
      )
        return;
      if (event.data?.type !== "fullchat:parent-ready") return;
      const payloads = buildPayloads(ticket);
      if (!payloads) return;
      for (const p of payloads) postToParent(p);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId, contactNumber]);

  // Limpa o foco no parent quando o componente desmonta.
  useEffect(() => {
    return () => {
      postToParent({ type: "fullchat:close" });
    };
  }, []);
}
