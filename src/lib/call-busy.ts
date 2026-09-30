/**
 * Sonda de "atendente ocupado" para as chamadas de WhatsApp (WABA, Dialog360,
 * Gupshup).
 *
 * Por que registry por injeção e não import dos stores: os planos dos canais BSP
 * decidiram que as tres familias sao copias independentes, sem import cruzado
 * (docs/PLANO_WABA_DIALOG360.md:180, docs/PLANO_WABA_GUPSHUP.md:226). Cada
 * provider registra a propria sonda no mount; este modulo nao conhece nenhum
 * store. Como efeito colateral, SIP/WaVoIP/chat interno podem entrar depois sem
 * tocar aqui.
 *
 * Regras defensivas (a falha do guard e SILENCIOSA — atendente que fica preso em
 * "ocupado" para de receber chamadas sem entender por que):
 * - "ended"/"idle" nao bloqueiam: o card fica 2s em "Chamada encerrada" e uma
 *   chamada legitima nesse intervalo nao pode ser descartada.
 * - callId falsy NUNCA marca ocupado, e decideIncomingWhatsappCall sem callId
 *   devolve "accept": sem id nao da para decidir duplicata, e o caminho seguro e
 *   tocar. (O outbound grava callId vazio quando o provedor devolve outro shape.)
 * - TTL de 2h sobre startedAt: rede de seguranca final contra estado preso.
 */

export type CallBusySnapshot = {
  state: string;
  callId?: string;
  startedAt?: number;
} | null;

export type CallBusyProbe = () => CallBusySnapshot;

export type IncomingCallDecision = "accept" | "duplicate" | "busy";

const BUSY_STATES = ["ringing", "pre_accepting", "active"];

const STALE_CALL_TTL_MS = 2 * 60 * 60 * 1000;

const probes = new Map<string, CallBusyProbe>();

/**
 * Registra a sonda de um provider. Devolve a funcao de remocao, no formato do
 * cleanup de useEffect.
 */
export function registerCallBusyProbe(
  id: string,
  probe: CallBusyProbe
): () => void {
  probes.set(id, probe);
  return () => {
    if (probes.get(id) === probe) probes.delete(id);
  };
}

/**
 * Primeira chamada de WhatsApp em curso, ou null. Entradas sem callId ou mais
 * velhas que o TTL sao ignoradas de proposito (ver cabecalho).
 */
export function getActiveWhatsappCall(): {
  callId: string;
  startedAt?: number;
} | null {
  const now = Date.now();

  for (const probe of probes.values()) {
    let snapshot: CallBusySnapshot = null;
    try {
      snapshot = probe();
    } catch {
      snapshot = null;
    }
    if (!snapshot) continue;
    if (!BUSY_STATES.includes(snapshot.state)) continue;

    const callId = snapshot.callId;
    if (!callId) continue;

    if (
      typeof snapshot.startedAt === "number" &&
      now - snapshot.startedAt > STALE_CALL_TTL_MS
    ) {
      continue;
    }

    return { callId, startedAt: snapshot.startedAt };
  }

  return null;
}

/**
 * O que fazer com uma chamada recebida.
 *
 * "duplicate" = mesmo callId da chamada corrente. Acontece por retry de webhook
 * (nenhum caminho dedupa por call.id antes do emit) e pelo escalonamento
 * queue-fallback, que reemite o MESMO callId
 * (WABAMetaHandleWebhookServiceZPRO.ts:6553).
 */
export function decideIncomingWhatsappCall(
  callId?: string
): IncomingCallDecision {
  if (!callId) return "accept";

  const active = getActiveWhatsappCall();
  if (!active) return "accept";

  return active.callId === callId ? "duplicate" : "busy";
}
