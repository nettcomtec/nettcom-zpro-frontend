import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Botão "Baixar" do atendimento e do chat interno (lib/media-fetch): porcentagem no
 * aviso, plano B pela rota do front só quando faz sentido, e erro de verdade quando
 * falha (antes, toda falha virava "Download iniciado!").
 */

const toastMock = vi.hoisted(() => ({
  loading: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  dismiss: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: toastMock }));

import {
  downloadMediaFile,
  fetchMediaForDownload,
  formatDownloadSize,
  isMediaGoneError,
  MediaFetchStatusError,
  readResponseBlob,
  type MediaDownloadProgress,
} from "@/lib/media-fetch";

const EXTERNAL = "https://bucket.example.com/tenant1/arquivo.zip";

function streamOf(chunks: Uint8Array[], opts: { failAfter?: number; signal?: AbortSignal | null } = {}) {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (opts.failAfter !== undefined && i >= opts.failAfter) {
        controller.error(new TypeError("network error"));
        return;
      }
      if (i < chunks.length) {
        controller.enqueue(chunks[i++]);
        return;
      }
      if (opts.signal) {
        // Corpo que para de chegar (rede parada sem erro): só o abort encerra.
        return new Promise<void>((resolve) => {
          opts.signal!.addEventListener("abort", () => {
            controller.error(new DOMException("aborted", "AbortError"));
            resolve();
          });
        });
      }
      controller.close();
    },
  });
}

function bytes(n: number, fill = 1): Uint8Array {
  return new Uint8Array(n).fill(fill);
}

function okResponse(chunks: Uint8Array[], headers: Record<string, string> = {}, opts: { failAfter?: number; signal?: AbortSignal | null } = {}) {
  return new Response(streamOf(chunks, opts), { status: 200, headers });
}

function statusResponse(status: number) {
  return new Response(JSON.stringify({ error: "x" }), { status });
}

async function flush() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
}

describe("readResponseBlob", () => {
  it("avisa o andamento com o total do Content-Length e monta o arquivo inteiro", async () => {
    const res = okResponse([bytes(300), bytes(700)], { "content-length": "1000", "content-type": "application/zip" });
    const seen: MediaDownloadProgress[] = [];
    const blob = await readResponseBlob(res, (p) => seen.push({ ...p }));
    expect(blob.size).toBe(1000);
    expect(blob.type).toBe("application/zip");
    expect(seen[0]).toEqual({ loaded: 0, total: 1000 });
    expect(seen.at(-1)).toEqual({ loaded: 1000, total: 1000 });
  });

  it("descarta o total quando chega mais que o declarado (resposta comprimida)", async () => {
    const res = okResponse([bytes(600), bytes(600)], { "content-length": "800" });
    const seen: MediaDownloadProgress[] = [];
    const blob = await readResponseBlob(res, (p) => seen.push({ ...p }));
    expect(blob.size).toBe(1200);
    expect(seen.at(-1)).toEqual({ loaded: 1200, total: null });
  });

  it("sem Content-Length informa só a quantidade baixada", async () => {
    const res = okResponse([bytes(10), bytes(20)]);
    const seen: MediaDownloadProgress[] = [];
    await readResponseBlob(res, (p) => seen.push({ ...p }));
    expect(seen.every((p) => p.total === null)).toBe(true);
    expect(seen.at(-1)?.loaded).toBe(30);
  });

  it("queda no meio do corpo rejeita (não entrega arquivo cortado)", async () => {
    const res = okResponse([bytes(10), bytes(10)], { "content-length": "100" }, { failAfter: 1 });
    await expect(readResponseBlob(res, () => undefined)).rejects.toThrow();
  });
});

describe("fetchMediaForDownload", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("direto deu certo: não passa pela rota do front", async () => {
    fetchMock.mockResolvedValueOnce(okResponse([bytes(5)], { "content-length": "5" }));
    const blob = await fetchMediaForDownload(EXTERNAL, "arquivo.zip");
    expect(blob.size).toBe(5);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].credentials).toBe("omit");
  });

  it("bloqueio antes de responder (CORS do bucket): repete pela rota do front", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(okResponse([bytes(7)], { "content-length": "7" }));
    const blob = await fetchMediaForDownload(EXTERNAL, "arquivo.zip");
    expect(blob.size).toBe(7);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      `/api/download?url=${encodeURIComponent(EXTERNAL)}&filename=${encodeURIComponent("arquivo.zip")}`,
    );
  });

  it("404 direto: arquivo não existe mais, sem tentar a rota do front", async () => {
    fetchMock.mockResolvedValueOnce(statusResponse(404));
    const err = await fetchMediaForDownload(EXTERNAL, "a.zip").catch((e) => e);
    expect(err).toBeInstanceOf(MediaFetchStatusError);
    expect(isMediaGoneError(err)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("recusa direta que não é 404 tenta a rota do front e repassa o status dela", async () => {
    fetchMock.mockResolvedValueOnce(statusResponse(403)).mockResolvedValueOnce(statusResponse(404));
    const err = await fetchMediaForDownload(EXTERNAL, "a.zip").catch((e) => e);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(isMediaGoneError(err)).toBe(true);
  });

  it("rota do front fora do ar (502) não é 'arquivo inexistente'", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(statusResponse(502));
    const err = await fetchMediaForDownload(EXTERNAL, "a.zip").catch((e) => e);
    expect(err).toBeInstanceOf(MediaFetchStatusError);
    expect(isMediaGoneError(err)).toBe(false);
  });

  it("endereço relativo: nunca vai para a rota do front", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(fetchMediaForDownload("/public/1/a.zip", "a.zip")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].credentials).toBe("include");

    fetchMock.mockResolvedValueOnce(statusResponse(404));
    const err = await fetchMediaForDownload("/public/1/a.zip", "a.zip").catch((e) => e);
    expect(isMediaGoneError(err)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("cancelado pelo vigia antes de responder não cai na rota do front", async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockRejectedValueOnce(new DOMException("aborted", "AbortError"));
    await expect(fetchMediaForDownload(EXTERNAL, "a.zip", { signal: controller.signal })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("formatDownloadSize", () => {
  it("usa a unidade certa e o separador do idioma", () => {
    expect(formatDownloadSize(40.5 * 1024 * 1024, "pt")).toMatch(/^40,5\s?MB$/);
    expect(formatDownloadSize(90 * 1024 * 1024, "en")).toMatch(/^90\s?MB$/);
    expect(formatDownloadSize(1536, "en")).toMatch(/^2\s?kB$/i);
    expect(formatDownloadSize(-5, "en")).toMatch(/^0\s?byte/);
  });
});

describe("downloadMediaFile", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;
  let toastSeq = 0;

  beforeEach(() => {
    toastSeq = 0;
    toastMock.loading.mockReset().mockImplementation(() => ++toastSeq);
    toastMock.success.mockReset();
    toastMock.error.mockReset();
    toastMock.dismiss.mockReset();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:fake"),
      revokeObjectURL: vi.fn(),
    });
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    clickSpy.mockRestore();
    vi.useRealTimers();
  });

  it("baixa com porcentagem, salva no aparelho e troca o aviso por sucesso sem a dica", async () => {
    fetchMock.mockResolvedValueOnce(okResponse([bytes(512 * 1024), bytes(512 * 1024)], { "content-length": String(1024 * 1024) }));
    downloadMediaFile(EXTERNAL, "arquivo.zip");

    // Andamento desenhado dentro do aviso (sem nova chamada ao sonner por pedaço).
    expect(toastMock.loading).toHaveBeenCalledTimes(1);
    const [titleFn, loadingOpts] = toastMock.loading.mock.calls[0];
    // Função (não elemento), senão o sonner desenha sem ícone e sem a dica.
    expect(typeof titleFn).toBe("function");
    expect(typeof loadingOpts.description).toBe("function");
    const titleEl = titleFn();
    const store = titleEl.props.store;
    expect(titleEl.props.field).toBe("title");
    expect(loadingOpts.description().props).toMatchObject({ store, field: "hint" });
    expect(store.get().title).toBe("Baixando arquivo...");
    const titles: string[] = [];
    store.subscribe(() => titles.push(store.get().title));
    await flush();

    expect(toastMock.loading).toHaveBeenCalledTimes(1);
    expect(titles.some((t) => /^Baixando arquivo\.\.\. 0% \(/.test(t))).toBe(true);
    expect(titles.at(-1)).toMatch(/^Baixando arquivo\.\.\. 100% \(1 MB de 1 MB\)$/);
    expect(store.get().hint).toBe("O arquivo vai para a pasta de downloads ao chegar em 100%.");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(toastMock.success).toHaveBeenCalledTimes(1);
    const [, successOpts] = toastMock.success.mock.calls[0];
    expect(successOpts.id).toBe(1);
    expect("description" in successOpts && successOpts.description === undefined).toBe(true);
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("arquivo apagado (404): diz que não está mais disponível, sem 'Tentar novamente'", async () => {
    fetchMock.mockResolvedValueOnce(statusResponse(404));
    downloadMediaFile(EXTERNAL, "a.zip");
    await flush();
    expect(toastMock.error).toHaveBeenCalledTimes(1);
    const [title, opts] = toastMock.error.mock.calls[0];
    expect(title).toBe("Este arquivo não está mais disponível no servidor.");
    expect(opts.action).toBeUndefined();
    expect(clickSpy).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("queda no meio: erro com 'Tentar novamente', que recomeça o download", async () => {
    fetchMock.mockResolvedValueOnce(okResponse([bytes(10), bytes(10)], { "content-length": "100" }, { failAfter: 1 }));
    downloadMediaFile(EXTERNAL, "a.zip");
    await flush();
    expect(toastMock.error).toHaveBeenCalledTimes(1);
    const [title, opts] = toastMock.error.mock.calls[0];
    expect(title).toBe("Erro ao baixar arquivo");
    expect(opts.description).toBe("A conexão caiu ou o servidor não entregou o arquivo. Tente novamente.");
    expect(opts.action.label).toBe("Tentar novamente");
    expect(clickSpy).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(okResponse([bytes(100)], { "content-length": "100" }));
    opts.action.onClick();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(toastMock.success).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("clique repetido no mesmo arquivo enquanto baixa é ignorado", async () => {
    let release!: (r: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((r) => { release = r; }));
    downloadMediaFile(EXTERNAL, "a.zip");
    downloadMediaFile(EXTERNAL, "a.zip");
    downloadMediaFile(EXTERNAL, "a.zip");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(toastMock.loading).toHaveBeenCalledTimes(1);
    release(okResponse([bytes(3)], { "content-length": "3" }));
    await flush();
    expect(toastMock.success).toHaveBeenCalledTimes(1);
  });

  it("novo clique depois de um erro fecha o aviso de erro anterior", async () => {
    fetchMock.mockResolvedValueOnce(statusResponse(404));
    downloadMediaFile(EXTERNAL, "a.zip");
    await flush();
    fetchMock.mockResolvedValueOnce(okResponse([bytes(3)], { "content-length": "3" }));
    downloadMediaFile(EXTERNAL, "a.zip");
    expect(toastMock.dismiss).toHaveBeenCalledWith(1);
    await flush();
  });

  it("rota do front recusa de vez (403): erro sem 'Tentar novamente'", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(statusResponse(403));
    downloadMediaFile(EXTERNAL, "a.zip");
    await flush();
    expect(toastMock.error).toHaveBeenCalledTimes(1);
    const [title, opts] = toastMock.error.mock.calls[0];
    expect(title).toBe("Erro ao baixar arquivo");
    expect(opts.action).toBeUndefined();
    expect("description" in opts && opts.description === undefined).toBe(true);
  });

  it("áudio: o .mp3 não existe e o original existe → baixa o original com o nome dele", async () => {
    const mp3 = "https://api.example.com/public/1/voz.mp3";
    const ogg = "https://api.example.com/public/1/voz.ogg";
    fetchMock.mockResolvedValueOnce(statusResponse(404)).mockResolvedValueOnce(okResponse([bytes(9)], { "content-length": "9" }));
    downloadMediaFile(mp3, "audio.mp3", { fallbackUrl: ogg, fallbackFilename: "audio.ogg" });
    await flush();
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([mp3, ogg]);
    expect(toastMock.success).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    const anchor = clickSpy.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("audio.ogg");
  });

  it("áudio: reserva igual ao principal não repete o pedido", async () => {
    fetchMock.mockResolvedValueOnce(statusResponse(404));
    downloadMediaFile(EXTERNAL, "audio.mp3", { fallbackUrl: EXTERNAL, fallbackFilename: "audio.ogg" });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(toastMock.error.mock.calls[0][0]).toBe("Este arquivo não está mais disponível no servidor.");
  });

  it("sem endereço: avisa que o arquivo não está disponível em vez de não fazer nada", () => {
    downloadMediaFile("", "a.zip");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledTimes(1);
    expect(toastMock.error.mock.calls[0][0]).toBe("Este arquivo não está mais disponível no servidor.");
  });

  it("direto travado sem recusar: em 20 s desiste e baixa pela rota do front", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockImplementationOnce((_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
      )
      .mockResolvedValueOnce(okResponse([bytes(4)], { "content-length": "4" }));
    downloadMediaFile(EXTERNAL, "a.zip");
    await vi.advanceTimersByTimeAsync(19_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toMatch(/^\/api\/download\?url=/);
    expect(toastMock.success).toHaveBeenCalledTimes(1);
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("aba em segundo plano não conta como rede parada", async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) =>
      Promise.resolve(okResponse([bytes(10)], { "content-length": "100" }, { signal: init.signal })),
    );
    downloadMediaFile(EXTERNAL, "a.zip");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(toastMock.error).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    await vi.advanceTimersByTimeAsync(70_000);
    expect(toastMock.error).toHaveBeenCalledTimes(1);
    visibility.mockRestore();
  });

  it("rede parada sem erro por 60 s: cancela e mostra 'Tentar novamente'", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) =>
      Promise.resolve(okResponse([bytes(10)], { "content-length": "100" }, { signal: init.signal })),
    );
    downloadMediaFile(EXTERNAL, "a.zip");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(toastMock.error).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(40_000);
    expect(toastMock.error).toHaveBeenCalledTimes(1);
    expect(toastMock.error.mock.calls[0][1].action.label).toBe("Tentar novamente");
    expect(clickSpy).not.toHaveBeenCalled();
  });
});
