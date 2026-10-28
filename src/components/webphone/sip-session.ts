"use client";

/**
 * Module-level SIP singleton — shared between AsteriskSipProvider (UA lifecycle)
 * and AsteriskWebphone (UI / call controls).
 * Lives at module scope so it survives modal open/close without re-registering.
 */
import type { UserAgent, Session } from "sip.js";
import type { SipLink } from "@/lib/sip-link";

/** `name` do erro quando o pedido de microfone fica sem resposta (ver AsteriskSipProvider). */
export const SIP_MIC_TIMEOUT_ERROR = "SipMicTimeout";

export const sipSession = {
  ua: null as UserAgent | null,
  /** Conexão e registro (reconexão automática); o botão "Reconectar agora" chama `link.reconnectNow()`. */
  link: null as SipLink | null,
  session: null as Session | null,
  /** Segunda perna usada na transferência consultiva (attended) — chamada ao ramal de destino. */
  consultSession: null as Session | null,
  /** Local SIP username/extension — set by AsteriskSipProvider on init, used for call logs */
  sipUsername: "" as string,
};
