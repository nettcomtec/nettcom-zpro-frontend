import api from "@/lib/api";

export interface SipTransferTarget {
  userId: number;
  name: string;
  sipUsername: string;
  sipStatus: "online" | "offline" | "busy";
  isOnline: boolean;
}

/** Atendentes do mesmo tenant/servidor SIP para os quais a chamada pode ser transferida (REFER ao ramal). */
export async function getSipTransferTargets() {
  return api.get<SipTransferTarget[]>("/sip/transfer-targets");
}
