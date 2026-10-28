import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DOWNLOAD_TOO_LARGE, NATIVE_SHARE_MAX_BYTES, canDownloadFiles, downloadFile } from "@/lib/download-file";

type CapacitorStub = {
  isNativePlatform: () => boolean;
  Plugins: Record<string, unknown>;
};

const setCapacitor = (value: CapacitorStub | undefined) => {
  if (value === undefined) delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  else (window as unknown as { Capacitor?: unknown }).Capacitor = value;
};

describe("downloadFile", () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => "blob:teste") as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    setCapacitor(undefined);
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("no navegador baixa por link e revoga a URL depois", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("Avaliacoes_2026-10-20.csv");
      expect(this.getAttribute("href")).toBe("blob:teste");
    });
    const blob = new Blob(["a;b"], { type: "text/csv" });

    const result = await downloadFile(blob, "Avaliacoes_2026-10-20.csv");

    expect(result).toBe("downloaded");
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll("a[download]").length).toBe(0);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:teste");
  });

  it("no app com o recurso entrega nome, tipo e base64 ao nativo", async () => {
    vi.useRealTimers();
    const share = vi.fn().mockResolvedValue({ ok: true });
    setCapacitor({ isNativePlatform: () => true, Plugins: { ZproFiles: { share } } });
    const blob = new Blob(["hello"], { type: "text/csv" });

    const result = await downloadFile(blob, "Avaliacoes.csv");

    expect(result).toBe("shared");
    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({ fileName: "Avaliacoes.csv", mimeType: "text/csv", base64: "aGVsbG8=" });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("no app, arquivo sem tipo vai como octet-stream", async () => {
    vi.useRealTimers();
    const share = vi.fn().mockResolvedValue({ ok: true });
    setCapacitor({ isNativePlatform: () => true, Plugins: { ZproFiles: { share } } });

    await downloadFile(new Blob(["x"]), "arquivo.bin");

    expect(share.mock.calls[0][0].mimeType).toBe("application/octet-stream");
  });

  it("no app antigo, sem o recurso, avisa para atualizar e não tenta o link", async () => {
    setCapacitor({ isNativePlatform: () => true, Plugins: {} });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const result = await downloadFile(new Blob(["x"], { type: "text/csv" }), "a.csv");

    expect(result).toBe("app_outdated");
    expect(click).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("no app, método não implementado no nativo também é app antigo", async () => {
    vi.useRealTimers();
    const share = vi.fn().mockRejectedValue({ code: "UNIMPLEMENTED" });
    setCapacitor({ isNativePlatform: () => true, Plugins: { ZproFiles: { share } } });

    await expect(downloadFile(new Blob(["x"]), "a.csv")).resolves.toBe("app_outdated");
  });

  it("no app, recusa do nativo é repassada", async () => {
    vi.useRealTimers();
    const share = vi.fn().mockRejectedValue(new Error("share failed"));
    setCapacitor({ isNativePlatform: () => true, Plugins: { ZproFiles: { share } } });

    await expect(downloadFile(new Blob(["x"]), "a.csv")).rejects.toThrow("share failed");
  });

  it("no app, arquivo acima do teto é recusado antes de ler", async () => {
    const share = vi.fn();
    setCapacitor({ isNativePlatform: () => true, Plugins: { ZproFiles: { share } } });
    const huge = { size: NATIVE_SHARE_MAX_BYTES + 1, type: "text/csv" } as Blob;

    await expect(downloadFile(huge, "grande.csv")).rejects.toThrow(DOWNLOAD_TOO_LARGE);
    expect(share).not.toHaveBeenCalled();
  });

  it("canDownloadFiles: navegador sim, app só com o recurso", () => {
    expect(canDownloadFiles()).toBe(true);
    setCapacitor({ isNativePlatform: () => true, Plugins: {} });
    expect(canDownloadFiles()).toBe(false);
    setCapacitor({ isNativePlatform: () => true, Plugins: { ZproFiles: { share: vi.fn() } } });
    expect(canDownloadFiles()).toBe(true);
  });
});
