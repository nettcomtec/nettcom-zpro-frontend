"use client";

/**
 * Module-level SIP singleton — shared between AsteriskSipProvider (UA lifecycle)
 * and AsteriskWebphone (UI / call controls).
 * Lives at module scope so it survives modal open/close without re-registering.
 */
import type { UserAgent, Registerer, Session } from "sip.js";

export const sipSession = {
  ua: null as UserAgent | null,
  registerer: null as Registerer | null,
  session: null as Session | null,
  /** Segunda perna usada na transferência consultiva (attended) — chamada ao ramal de destino. */
  consultSession: null as Session | null,
  /** Local SIP username/extension — set by AsteriskSipProvider on init, used for call logs */
  sipUsername: "" as string,
};
