import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const toastError = vi.fn();
const toastLoading = vi.fn(() => "loading-id");
const toastDismiss = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    loading: (...args: unknown[]) => toastLoading(...(args as [])),
    dismiss: (...args: unknown[]) => toastDismiss(...args),
  },
}));

import { notifyUnreadablePickedFile, pickedFilesBudget, preparePickedFile, preparePickedFiles } from "@/lib/picked-file";

const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; SM-S911B Build/UP1A; wv) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36";
const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36";

const setUserAgent = (ua: string) => vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(ua);

// Arquivo do seletor: leitura controlada por teste (o atalho do seletor de mídia recusa com NotReadableError).
function pickedFile(
  name: string,
  type: string,
  opts: { bytes?: number; size?: number; read?: () => Promise<ArrayBuffer> } = {},
): File {
  const bytes = opts.bytes ?? 8;
  const file = new File([new Uint8Array(bytes).fill(7)], name, { type, lastModified: 1_700_000_000_000 });
  if (opts.size !== undefined) Object.defineProperty(file, "size", { value: opts.size });
  const read = opts.read ?? (() => Promise.resolve(new Uint8Array(bytes).fill(7).buffer));
  Object.defineProperty(file, "arrayBuffer", { value: vi.fn(read) });
  const slice = vi.fn(() => ({ arrayBuffer: vi.fn(read) }));
  Object.defineProperty(file, "slice", { value: slice });
  return file;
}

const notReadable = () => Promise.reject(Object.assign(new Error("denied"), { name: "NotReadableError" }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("preparePickedFile", () => {
  it("fora do Android devolve o mesmo arquivo sem ler", async () => {
    setUserAgent(DESKTOP_UA);
    const file = pickedFile("foto.jpg", "image/jpeg");
    expect(await preparePickedFile(file)).toBe(file);
    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });

  it("no Android copia a imagem para a memória mantendo nome, tipo e data", async () => {
    setUserAgent(ANDROID_UA);
    const file = pickedFile("17654.jpg", "image/jpeg", { bytes: 12 });
    const ready = await preparePickedFile(file);
    expect(ready).not.toBeNull();
    expect(ready).not.toBe(file);
    expect(ready!.name).toBe("17654.jpg");
    expect(ready!.type).toBe("image/jpeg");
    expect(ready!.lastModified).toBe(1_700_000_000_000);
    expect(ready!.size).toBe(12);
  });

  it("imagem que o aparelho não deixa ler volta null", async () => {
    setUserAgent(ANDROID_UA);
    const file = pickedFile("17654.jpg", "image/jpeg", { read: notReadable });
    expect(await preparePickedFile(file)).toBeNull();
  });

  it("mídia vazia volta null", async () => {
    setUserAgent(ANDROID_UA);
    expect(await preparePickedFile(pickedFile("17654.jpg", "image/jpeg", { bytes: 0 }))).toBeNull();
  });

  it("documento não passa pela leitura", async () => {
    setUserAgent(ANDROID_UA);
    const file = pickedFile("contrato.pdf", "application/pdf", { read: notReadable });
    expect(await preparePickedFile(file)).toBe(file);
    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });

  it("vídeo acima do teto só passa pela leitura curta e segue o original", async () => {
    setUserAgent(ANDROID_UA);
    const file = pickedFile("video.mp4", "video/mp4", { size: 80 * 1024 * 1024 });
    expect(await preparePickedFile(file)).toBe(file);
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(file.slice).toHaveBeenCalledWith(0, 64 * 1024);
  });

  it("vídeo acima do teto com leitura recusada volta null", async () => {
    setUserAgent(ANDROID_UA);
    const file = pickedFile("video.mp4", "video/mp4", { size: 80 * 1024 * 1024, read: notReadable });
    expect(await preparePickedFile(file)).toBeNull();
  });

  it("leitura que não termina mantém o arquivo original (comportamento de antes)", async () => {
    setUserAgent(ANDROID_UA);
    vi.useFakeTimers();
    const file = pickedFile("17654.jpg", "image/jpeg", { read: () => new Promise<ArrayBuffer>(() => {}) });
    const pending = preparePickedFile(file);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await pending).toBe(file);
  });

  it("erro que não é recusa de leitura mantém o original", async () => {
    setUserAgent(ANDROID_UA);
    const file = pickedFile("17654.jpg", "image/jpeg", { read: () => Promise.reject(new RangeError("memória")) });
    expect(await preparePickedFile(file)).toBe(file);
  });
});

describe("preparePickedFiles", () => {
  beforeEach(() => setUserAgent(ANDROID_UA));

  it("separa os ilegíveis e mantém a ordem dos demais", async () => {
    const a = pickedFile("a.jpg", "image/jpeg");
    const b = pickedFile("b.jpg", "image/jpeg", { read: notReadable });
    const c = pickedFile("c.pdf", "application/pdf");
    const { ready, unreadable } = await preparePickedFiles([a, b, c]);
    expect(unreadable).toBe(1);
    expect(ready.map((f) => f.name)).toEqual(["a.jpg", "c.pdf"]);
  });

  it("acima do teto somado da escolha deixa de copiar e só confere", async () => {
    const big = () => pickedFile("v.mp4", "video/mp4", { size: 45 * 1024 * 1024 });
    const files = [big(), big(), big(), big()];
    await preparePickedFiles(files);
    expect(files.map((f) => (f.arrayBuffer as unknown as { mock: { calls: unknown[] } }).mock.calls.length)).toEqual([1, 1, 1, 0]);
    expect(files[3].slice).toHaveBeenCalled();
  });

  it("o que já está anexado no campo conta no teto", async () => {
    const attached = [pickedFile("ja.mp4", "video/mp4", { size: 140 * 1024 * 1024 })];
    const next = pickedFile("v.mp4", "video/mp4", { size: 20 * 1024 * 1024 });
    const { ready } = await preparePickedFiles([next], pickedFilesBudget(attached));
    expect(ready[0]).toBe(next);
    expect(next.arrayBuffer).not.toHaveBeenCalled();
    expect(next.slice).toHaveBeenCalled();
  });
});

describe("aviso Preparando arquivo", () => {
  beforeEach(() => { toastLoading.mockClear(); toastDismiss.mockClear(); });

  it("leitura demorada mostra o aviso e tira no fim", async () => {
    setUserAgent(ANDROID_UA);
    vi.useFakeTimers();
    let finish: (b: ArrayBuffer) => void = () => {};
    const file = pickedFile("17654.jpg", "image/jpeg", { read: () => new Promise<ArrayBuffer>((r) => { finish = r; }) });
    const pending = preparePickedFile(file, undefined, { preparingMessage: "Preparando" });
    await vi.advanceTimersByTimeAsync(500);
    expect(toastLoading).toHaveBeenCalledWith("Preparando");
    finish(new Uint8Array(8).buffer);
    await pending;
    expect(toastDismiss).toHaveBeenCalledWith("loading-id");
  });

  it("fora do Android não pisca aviso", async () => {
    setUserAgent(DESKTOP_UA);
    vi.useFakeTimers();
    const pending = preparePickedFiles([pickedFile("a.jpg", "image/jpeg")], undefined, { preparingMessage: "Preparando" });
    await vi.advanceTimersByTimeAsync(1000);
    await pending;
    expect(toastLoading).not.toHaveBeenCalled();
  });
});

describe("notifyUnreadablePickedFile", () => {
  beforeEach(() => toastError.mockClear());

  it("o atalho reabre o campo sem filtro e devolve o filtro de antes", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    const acceptAtClick: string[] = [];
    vi.spyOn(input, "click").mockImplementation(() => { acceptAtClick.push(input.accept); });
    notifyUnreadablePickedFile("msg", "Abrir arquivos", input);
    const opts = toastError.mock.calls[0][1] as { action: { label: string; onClick: () => void } };
    expect(opts.action.label).toBe("Abrir arquivos");
    // Um aviso só, mesmo com vários arquivos recusados.
    expect((toastError.mock.calls[0][1] as { id?: string }).id).toBe("picked-file-unreadable");
    opts.action.onClick();
    expect(acceptAtClick).toEqual(["*/*"]);
    expect(input.accept).toBe("image/*");
  });

  it("sem campo, avisa sem atalho", () => {
    notifyUnreadablePickedFile("msg", "Abrir arquivos", null);
    expect(toastError.mock.calls[0][1]).not.toHaveProperty("action");
  });
});
