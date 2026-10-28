import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Atendimentos fixados (lib/pinned-tickets.ts): a lista acompanha o usuário em todo aparelho,
 * e o clique grava só a mudança sobre a lista do servidor.
 */
type Lib = typeof import("@/lib/pinned-tickets");
let lib: Lib;

beforeEach(async () => {
  // A fila e a proteção do refresh são do módulo: cada teste começa do zero.
  vi.resetModules();
  lib = await import("@/lib/pinned-tickets");
});

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Servidor e tela simulados: `server` é o que o banco tem, `local` o que a tela mostra. */
function setup(server: unknown, local: number[]) {
  const state = { server, local, writes: [] as number[][] };
  const io = {
    readServer: vi.fn(async () => state.server),
    write: vi.fn(async (ids: number[]) => {
      state.writes.push(ids);
      state.server = ids;
    }),
    getLocal: () => state.local,
    setLocal: (ids: number[]) => {
      state.local = ids;
    },
  };
  return { state, io };
}

describe("lista de fixados", () => {
  it("normaliza o que vem do servidor", () => {
    expect(lib.normalizePinnedTicketIds(undefined)).toEqual([]);
    expect(lib.normalizePinnedTicketIds({ 0: 1 })).toEqual([]);
    expect(lib.normalizePinnedTicketIds([3, "7", " 9 ", 3, 0, -2, 1.5, "x", null])).toEqual([3, 7, 9]);
  });

  it("fixar vai para o fim, já fixado fica no lugar, desafixar tira", () => {
    expect(lib.applyPinChange([1, 2], 3, true)).toEqual([1, 2, 3]);
    expect(lib.applyPinChange([1, 2, 3], 1, true)).toEqual([1, 2, 3]);
    expect(lib.applyPinChange([1, 2, 3], 2, false)).toEqual([1, 3]);
    expect(lib.applyPinChange(undefined, 4, true)).toEqual([4]);
  });
});

describe("clique em fixar", () => {
  it("aparece na hora e grava sobre a lista do servidor, sem apagar o outro aparelho", async () => {
    const { state, io } = setup([5], [1]);
    const done = lib.queuePinChange({ ticketId: 2, pin: true }, io);
    expect(state.local).toEqual([1, 2]);
    await expect(done).resolves.toBe(true);
    expect(state.writes).toEqual([[5, 2]]);
    expect(state.local).toEqual([5, 2]);
  });

  it("desafixar mantém o que outro aparelho fixou", async () => {
    const { state, io } = setup([5, 1], [1]);
    await expect(lib.queuePinChange({ ticketId: 1, pin: false }, io)).resolves.toBe(true);
    expect(state.writes).toEqual([[5]]);
    expect(state.local).toEqual([5]);
  });

  it("sem a lista do servidor não grava e desfaz o clique no mesmo lugar", async () => {
    const { state, io } = setup([], [1, 2, 3]);
    io.readServer.mockRejectedValueOnce(new Error("rede"));
    const done = lib.queuePinChange({ ticketId: 2, pin: false }, io);
    expect(state.local).toEqual([1, 3]);
    await expect(done).resolves.toBe(false);
    expect(io.write).not.toHaveBeenCalled();
    expect(state.local).toEqual([1, 2, 3]);
  });

  it("gravação recusada desfaz o clique", async () => {
    const { state, io } = setup([1], [1]);
    io.write.mockRejectedValueOnce(new Error("403"));
    await expect(lib.queuePinChange({ ticketId: 4, pin: true }, io)).resolves.toBe(false);
    expect(state.local).toEqual([1]);
  });

  it("dois cliques seguidos gravam um depois do outro, sem perder o primeiro", async () => {
    const { state, io } = setup([9], []);
    const firstWrite = deferred();
    io.write.mockImplementationOnce(async (ids: number[]) => {
      await firstWrite.promise;
      state.writes.push(ids);
      state.server = ids;
    });
    const first = lib.queuePinChange({ ticketId: 2, pin: true }, io);
    const second = lib.queuePinChange({ ticketId: 3, pin: true }, io);
    expect(state.local).toEqual([2, 3]);
    await Promise.resolve();
    // O segundo só lê o servidor depois de o primeiro gravar.
    expect(io.readServer).toHaveBeenCalledTimes(1);
    firstWrite.resolve();
    await first;
    // Lista gravada + o clique que ainda está na fila.
    expect(state.local).toEqual([9, 2, 3]);
    await second;
    expect(state.writes).toEqual([[9, 2], [9, 2, 3]]);
    expect(state.local).toEqual([9, 2, 3]);
  });

  it("clique seguinte no mesmo atendimento decide o estado dele quando o anterior falha", async () => {
    const { state, io } = setup([], []);
    io.write.mockRejectedValueOnce(new Error("rede"));
    const pin = lib.queuePinChange({ ticketId: 7, pin: true }, io);
    const unpin = lib.queuePinChange({ ticketId: 7, pin: false }, io);
    await expect(pin).resolves.toBe(false);
    await expect(unpin).resolves.toBe(true);
    expect(state.local).toEqual([]);
    expect(state.server).toEqual([]);
  });
});

describe("refresh de 30 s", () => {
  it("a lista local só vence quando a leitura pode ser anterior a uma gravação", async () => {
    const before = lib.pinnedTicketsClock();
    expect(lib.shouldKeepLocalPinnedTickets(before)).toBe(false);

    const { io } = setup([], []);
    const write = deferred();
    io.write.mockImplementationOnce(() => write.promise);
    const done = lib.queuePinChange({ ticketId: 1, pin: true }, io);
    // Gravação em andamento: qualquer leitura mantém o clique.
    expect(lib.shouldKeepLocalPinnedTickets(lib.pinnedTicketsClock())).toBe(true);
    write.resolve();
    await done;

    // Leitura que começou antes de a gravação terminar pode ter lido o banco antigo.
    expect(lib.shouldKeepLocalPinnedTickets(before)).toBe(true);
    // Leitura que começou depois já vê o banco novo: vale o servidor.
    await new Promise((resolve) => setTimeout(resolve, 2));
    expect(lib.shouldKeepLocalPinnedTickets(lib.pinnedTicketsClock())).toBe(false);
  });
});
