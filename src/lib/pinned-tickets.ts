/**
 * Atendimentos fixados no topo da lista de /atendimento, por usuário, em
 * `User.configs.pinnedTickets` (a ordem é a ordem em que foram fixados).
 *
 * A lista acompanha a pessoa em todo aparelho (navegador, PWA, app). Até 2026-10-19 cada
 * aparelho ficava com a própria cópia: o refresh de 30 s do usuário mantinha sempre a lista
 * local e o clique gravava a lista INTEIRA deste aparelho, apagando no servidor o que outro
 * aparelho tinha fixado. Hoje:
 *   - o refresh traz a lista do servidor; a local só vence quando a leitura pode ser anterior
 *     a uma gravação deste aparelho (`shouldKeepLocalPinnedTickets`, mesmo critério do botão
 *     de som em lib/notification-sound-mute.ts);
 *   - o clique relê a lista do servidor e grava só a mudança daquele atendimento sobre ela
 *     (`queuePinChange`), um clique por vez nesta aba.
 * Só a tela muda: a rota e o formato gravado são os de sempre.
 */

export function normalizePinnedTicketIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const raw of value) {
    const id =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && /^\d+$/.test(raw.trim())
          ? Number(raw.trim())
          : NaN;
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** Fixar vai para o fim da lista (já fixado fica onde está); desafixar tira. */
export function applyPinChange(list: unknown, ticketId: number, pin: boolean): number[] {
  const ids = normalizePinnedTicketIds(list);
  if (pin) return ids.includes(ticketId) ? ids : [...ids, ticketId];
  return ids.filter((id) => id !== ticketId);
}

// Relógio monotônico: acertar a hora do aparelho não estica nem encurta a proteção.
let writesInFlight = 0;
let lastWriteSettledAt = Number.NEGATIVE_INFINITY;

export function pinnedTicketsClock(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

/** `true` = a leitura que começou em `readStartedAt` não pode trocar a lista local. */
export function shouldKeepLocalPinnedTickets(readStartedAt: number): boolean {
  return writesInFlight > 0 || lastWriteSettledAt >= readStartedAt;
}

export interface PinChange {
  ticketId: number;
  pin: boolean;
}

export interface PinnedTicketsIO {
  /** Lista gravada no servidor agora (o `configs.pinnedTickets` cru). */
  readServer: () => Promise<unknown>;
  /** Grava a lista inteira no servidor. */
  write: (ids: number[]) => Promise<unknown>;
  getLocal: () => number[];
  setLocal: (ids: number[]) => void;
}

const pendingChanges: PinChange[] = [];
let queue: Promise<unknown> = Promise.resolve();

function withPending(base: number[]): number[] {
  return pendingChanges.reduce((ids, change) => applyPinChange(ids, change.ticketId, change.pin), base);
}

/**
 * Aplica o clique na tela na hora e grava no servidor na fila desta aba. Resolve `true` se
 * gravou; na falha, o clique é desfeito na tela.
 */
export function queuePinChange(change: PinChange, io: PinnedTicketsIO): Promise<boolean> {
  const before = normalizePinnedTicketIds(io.getLocal());
  const previousIndex = before.indexOf(change.ticketId);
  pendingChanges.push(change);
  writesInFlight += 1;
  io.setLocal(applyPinChange(before, change.ticketId, change.pin));

  const run = async (): Promise<boolean> => {
    let saved: number[] | null = null;
    try {
      // Sem a lista do servidor o clique falha (e volta na tela): gravar a deste aparelho
      // apagaria em silêncio o que outro aparelho fixou.
      const base = normalizePinnedTicketIds(await io.readServer());
      const next = applyPinChange(base, change.ticketId, change.pin);
      await io.write(next);
      saved = next;
    } catch {
      saved = null;
    } finally {
      const index = pendingChanges.indexOf(change);
      if (index !== -1) pendingChanges.splice(index, 1);
      writesInFlight = Math.max(0, writesInFlight - 1);
      lastWriteSettledAt = pinnedTicketsClock();
    }

    if (saved) {
      // Lista do servidor (com o que outro aparelho fixou) + os cliques ainda na fila.
      io.setLocal(withPending(saved));
      return true;
    }
    // Um clique seguinte no mesmo atendimento decide o estado dele.
    if (!pendingChanges.some((pending) => pending.ticketId === change.ticketId)) {
      const current = applyPinChange(io.getLocal(), change.ticketId, false);
      if (!change.pin && previousIndex !== -1) {
        current.splice(Math.min(previousIndex, current.length), 0, change.ticketId);
      }
      io.setLocal(current);
    }
    return false;
  };

  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}
