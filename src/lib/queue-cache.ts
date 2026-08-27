// Cache leve id -> { name, color } das filas do tenant.
//
// Motivacao: emits de socket "magros" do backend (ticket:update sem reload da
// associacao Queue) chegam ao /atendimento so com o `queueId` escalar, sem o
// objeto `queue`. O normalize-ticket entao montava `{ id, name: "", color: "#666" }`
// e a badge da fila sumia do painel, apesar do `queueId` estar GRAVADO no banco
// (bug "ticket na fila X no banco, painel sem fila").
//
// Este cache eh populado uma vez quando a lista de filas eh carregada (fetchQueues)
// e consultado de forma SINCRONA pelo normalize-ticket / ticket-store para resolver
// nome e cor a partir do queueId, tornando o front resiliente a qualquer emit magro
// (cobre todos os ~30 sites de emit de uma vez, sem depender do backend).

export type QueueMeta = { name: string; color: string };

const queueCache = new Map<number, QueueMeta>();

type QueueLike = {
  id?: number | null;
  name?: string | null;
  queue?: string | null; // coluna do model no backend (nome da fila)
  color?: string | null;
};

/**
 * Popula/atualiza o cache com a lista de filas carregada via REST.
 * Nao sobrescreve um nome/cor bom com vazio (chamadas parciais sao toleradas).
 */
export function setQueueCache(queues: QueueLike[] | null | undefined): void {
  if (!Array.isArray(queues)) return;
  for (const q of queues) {
    if (!q || typeof q.id !== "number") continue;
    const name = (q.name ?? q.queue ?? "").toString();
    const color = (q.color ?? "").toString();
    const prev = queueCache.get(q.id);
    queueCache.set(q.id, {
      name: name || prev?.name || "",
      color: color || prev?.color || "",
    });
  }
}

/** Resolve { name, color } de uma fila pelo id; undefined se desconhecida. */
export function resolveQueueMeta(id: number | null | undefined): QueueMeta | undefined {
  if (id == null) return undefined;
  return queueCache.get(id);
}
