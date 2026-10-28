// Leitura, pelo navegador, da mídia de uma mensagem (encaminhar e baixar).
// Bucket S3/R2 sem CORS bloqueia o fetch direto: aí a leitura passa pela rota
// /api/download do próprio front, que busca do lado do servidor. O token de
// login só vai para o backend, nunca para o armazenamento externo.

import { createElement, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { uiT } from "@/lib/ui-t";
import { getUiLocale } from "@/lib/ui-locale";

const API_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:3101").origin;
  } catch {
    return "";
  }
})();

function isAbsoluteHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function isBackendUrl(url: string): boolean {
  try {
    return new URL(url, window.location.href).origin === API_ORIGIN;
  } catch {
    return false;
  }
}

export function buildMediaDownloadProxyUrl(url: string, filename?: string): string {
  const query = `url=${encodeURIComponent(url)}`;
  return filename
    ? `/api/download?${query}&filename=${encodeURIComponent(filename)}`
    : `/api/download?${query}`;
}

/** Nome do arquivo no fim do caminho da URL (o lightbox não guarda o nome da mídia). */
export function mediaFileNameFromUrl(url: string, fallback = "arquivo"): string {
  try {
    const last = new URL(url, window.location.href).pathname.split("/").pop() || "";
    return decodeURIComponent(last) || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Baixa a mídia como Blob. Tenta direto; se o navegador bloquear (CORS do bucket
 * ou rede), repete pela rota do front. Resposta com erro não é repetida.
 */
export async function fetchMediaBlob(
  url: string,
  opts: { authToken?: string | null; credentials?: RequestCredentials } = {},
): Promise<Blob> {
  const absolute = isAbsoluteHttpUrl(url);
  const headers: Record<string, string> | undefined =
    opts.authToken && (!absolute || isBackendUrl(url))
      ? { Authorization: `Bearer ${opts.authToken}` }
      : undefined;

  let direct: Response | null = null;
  try {
    direct = await fetch(url, { headers, credentials: opts.credentials ?? (absolute ? "omit" : "include") });
  } catch {
    direct = null;
  }
  if (direct) {
    if (!direct.ok) throw new Error("media fetch failed");
    return direct.blob();
  }
  if (!absolute) throw new Error("media fetch failed");

  const proxied = await fetch(buildMediaDownloadProxyUrl(url), { credentials: "same-origin" });
  if (!proxied.ok) throw new Error("media fetch failed");
  return proxied.blob();
}

// ── Baixar para o aparelho (botão "Baixar" do atendimento e do chat interno) ──

export type MediaDownloadProgress = { loaded: number; total: number | null };

/** Resposta recusada (404, 403, 502…), separada da queda de conexão. */
export class MediaFetchStatusError extends Error {
  readonly status: number;
  /** "proxy" = recusa da rota /api/download do próprio front. */
  readonly source: "direct" | "proxy";
  constructor(status: number, source: "direct" | "proxy") {
    super(`media fetch failed: ${status}`);
    this.name = "MediaFetchStatusError";
    this.status = status;
    this.source = source;
  }
}

/** O arquivo não existe mais no servidor: repetir não adianta. */
export function isMediaGoneError(err: unknown): boolean {
  return err instanceof MediaFetchStatusError && (err.status === 404 || err.status === 410);
}

/**
 * A rota do front recusou de vez: endereço inválido (400) ou destino que ela não
 * busca (403, ex.: armazenamento em rede interna). Repetir dá o mesmo resultado.
 */
export function isDefinitiveDownloadRefusal(err: unknown): boolean {
  return err instanceof MediaFetchStatusError && err.source === "proxy" && (err.status === 400 || err.status === 403);
}

/**
 * Lê o corpo como Blob avisando o andamento. Os bytes só são contados no caminho:
 * quem monta o arquivo é o próprio navegador (`Response.blob()`), que gasta menos
 * memória que juntar os pedaços no JS. `total` vem do Content-Length e vira null
 * quando o que chega passa dele (resposta comprimida declara o tamanho comprimido).
 */
export async function readResponseBlob(
  res: Response,
  onProgress?: (progress: MediaDownloadProgress) => void,
): Promise<Blob> {
  if (!onProgress || !res.body || typeof TransformStream === "undefined") return res.blob();
  const type = res.headers.get("content-type");
  const declared = Number(res.headers.get("content-length"));
  let total: number | null = Number.isFinite(declared) && declared > 0 ? declared : null;
  let loaded = 0;
  onProgress({ loaded, total });
  const counted = res.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        loaded += chunk.byteLength;
        if (total !== null && loaded > total) total = null;
        onProgress({ loaded, total });
        controller.enqueue(chunk);
      },
    }),
  );
  return new Response(counted, type ? { headers: { "content-type": type } } : undefined).blob();
}

function discardBody(res: Response): void {
  try {
    void res.body?.cancel().catch(() => undefined);
  } catch {
    /* corpo já consumido */
  }
}

// Prazo do pedido DIRETO até os cabeçalhos: host do armazenamento que some da rede
// (sem recusar) prenderia o navegador por 1 a 2 min antes do plano B pela rota.
const DIRECT_HEADERS_TIMEOUT_MS = 20_000;

/** Pedido direto; null = bloqueado (CORS), rede ou prazo — quem chama decide o plano B. */
async function fetchDirect(url: string, absolute: boolean, outer?: AbortSignal): Promise<Response | null> {
  const controller = new AbortController();
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener("abort", () => controller.abort(), { once: true });
  }
  const timer = absolute ? setTimeout(() => controller.abort(), DIRECT_HEADERS_TIMEOUT_MS) : null;
  try {
    return await fetch(url, { credentials: absolute ? "omit" : "include", signal: controller.signal });
  } catch (err) {
    if (outer?.aborted) throw err;
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Baixa a mídia para salvar no aparelho, com andamento. Tenta direto; se o navegador
 * bloquear antes de responder (CORS do bucket, prazo) ou o servidor recusar por outro
 * motivo que não "arquivo inexistente", repete pela rota do front (`onFallback` avisa
 * quando). Queda no meio do download não é repetida sozinha (recomeçaria do zero):
 * quem chama oferece "Tentar novamente".
 */
export async function fetchMediaForDownload(
  url: string,
  filename: string,
  opts: {
    signal?: AbortSignal;
    onProgress?: (progress: MediaDownloadProgress) => void;
    onFallback?: () => void;
  } = {},
): Promise<Blob> {
  const absolute = isAbsoluteHttpUrl(url);
  const direct = await fetchDirect(url, absolute, opts.signal);
  if (direct?.ok) return readResponseBlob(direct, opts.onProgress);
  if (direct) {
    discardBody(direct);
    if (!absolute || direct.status === 404 || direct.status === 410) {
      throw new MediaFetchStatusError(direct.status, "direct");
    }
  } else if (!absolute) {
    throw new Error("media fetch failed");
  }

  opts.onFallback?.();
  const proxied = await fetch(buildMediaDownloadProxyUrl(url, filename), {
    credentials: "same-origin",
    signal: opts.signal,
  });
  if (!proxied.ok) {
    discardBody(proxied);
    throw new MediaFetchStatusError(proxied.status, "proxy");
  }
  return readResponseBlob(proxied, opts.onProgress);
}

const SIZE_UNITS = ["byte", "kilobyte", "megabyte", "gigabyte"] as const;
const SIZE_FALLBACK_LABELS = ["B", "KB", "MB", "GB"];

/** "40,5 MB" no idioma da tela (unidade traduzida pelo navegador: "Mo" em francês). */
export function formatDownloadSize(bytes: number, locale?: string): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const maximumFractionDigits = unit >= 2 ? 1 : 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: "unit",
      unit: SIZE_UNITS[unit],
      unitDisplay: "short",
      maximumFractionDigits,
    }).format(value);
  } catch {
    return `${value.toFixed(maximumFractionDigits)} ${SIZE_FALLBACK_LABELS[unit]}`;
  }
}

// Sem nenhum byte por 60 s (rede parada sem erro, comum no celular) = falha com
// "Tentar novamente", em vez de "Baixando..." para sempre.
const DOWNLOAD_STALL_MS = 60_000;
const DOWNLOAD_STALL_CHECK_MS = 5_000;
const PROGRESS_PAINT_MS = 250;
const SAVED_URL_REVOKE_MS = 30_000;

const downloadingMedia = new Set<string>();
const lastErrorToastByUrl = new Map<string, string | number>();

// Relógio que não pula com ajuste de hora do aparelho.
function monotonicNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function progressTitle(progress: MediaDownloadProgress, locale: string): string {
  const { loaded, total } = progress;
  if (total) {
    const percent = Math.min(100, Math.floor((loaded / total) * 100));
    return uiT(
      "common.downloadProgress",
      { percent, loaded: formatDownloadSize(loaded, locale), total: formatDownloadSize(total, locale) },
      "Baixando arquivo... {percent}% ({loaded} de {total})",
    );
  }
  if (loaded > 0) {
    return uiT(
      "common.downloadProgressSize",
      { loaded: formatDownloadSize(loaded, locale) },
      "Baixando arquivo... {loaded}",
    );
  }
  return uiT("common.downloadLoading", undefined, "Baixando arquivo...");
}

function progressHint(total: number | null): string {
  return total
    ? uiT("common.downloadProgressHint", undefined, "O arquivo vai para a pasta de downloads ao chegar em 100%.")
    : uiT(
        "common.downloadProgressHintNoTotal",
        undefined,
        "O arquivo vai para a pasta de downloads quando terminar de baixar.",
      );
}

function unavailableTexts(): [string, string] {
  return [
    uiT("common.downloadUnavailable", undefined, "Este arquivo não está mais disponível no servidor."),
    uiT(
      "common.downloadUnavailableHint",
      undefined,
      "Ele pode ter sido apagado do servidor, por exemplo pela limpeza automática de arquivos antigos.",
    ),
  ];
}

// O andamento é desenhado DENTRO do aviso, por esta loja: atualizar o aviso a cada
// pedaço passaria pela fila do sonner (um setTimeout por atualização), e a última
// ("100%") chegava DEPOIS do "sucesso" quando as duas saíam no mesmo instante —
// o aviso ficava preso em "Baixando... 100%". Só "começou" e "terminou" vão ao sonner.
type DownloadProgressView = { title: string; hint: string };
type DownloadProgressStore = {
  get: () => DownloadProgressView;
  set: (next: DownloadProgressView) => void;
  subscribe: (listener: () => void) => () => void;
};

function createDownloadProgressStore(initial: DownloadProgressView): DownloadProgressStore {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      if (next.title === value.title && next.hint === value.hint) return;
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function DownloadProgressField({ store, field }: { store: DownloadProgressStore; field: keyof DownloadProgressView }) {
  const read = () => store.get()[field];
  return useSyncExternalStore(store.subscribe, read, read);
}

function saveBlobToDevice(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), SAVED_URL_REVOKE_MS);
}

export type DownloadMediaOptions = {
  /** Tentado só quando o principal não existe mais (ex.: áudio .mp3 convertido → .ogg original). */
  fallbackUrl?: string;
  fallbackFilename?: string;
};

/**
 * Botão "Baixar": aviso com porcentagem e tamanho enquanto baixa, salva no aparelho
 * no fim e, se falhar, diz por quê ("não existe mais" ou "Tentar novamente").
 * Clique repetido no mesmo arquivo enquanto baixa é ignorado.
 */
export function downloadMediaFile(url: string, filename = "arquivo", options: DownloadMediaOptions = {}): void {
  if (!url) {
    const [title, description] = unavailableTexts();
    toast.error(title, { description });
    return;
  }
  if (downloadingMedia.has(url)) return;
  downloadingMedia.add(url);

  const previousError = lastErrorToastByUrl.get(url);
  if (previousError !== undefined) {
    toast.dismiss(previousError);
    lastErrorToastByUrl.delete(url);
  }

  const locale = getUiLocale();
  const progressStore = createDownloadProgressStore({
    title: uiT("common.downloadLoading", undefined, "Baixando arquivo..."),
    hint: progressHint(null),
  });
  // Em função, não elemento: título que já é elemento vira aviso "personalizado" no
  // sonner (sem ícone girando e sem a dica).
  const toastId = toast.loading(() => createElement(DownloadProgressField, { store: progressStore, field: "title" }), {
    description: () => createElement(DownloadProgressField, { store: progressStore, field: "hint" }),
  });

  const controller = new AbortController();
  let stalled = false;
  let lastActivity = monotonicNow();
  let lastTick = lastActivity;
  const touch = () => {
    lastActivity = monotonicNow();
  };
  const watchdog = setInterval(() => {
    const now = monotonicNow();
    // Aba em segundo plano ou congelada (celular): o tempo parado não é da rede.
    const frozen =
      now - lastTick > DOWNLOAD_STALL_CHECK_MS * 2 ||
      (typeof document !== "undefined" && document.visibilityState === "hidden");
    lastTick = now;
    if (frozen) {
      lastActivity = now;
      return;
    }
    if (now - lastActivity < DOWNLOAD_STALL_MS) return;
    stalled = true;
    controller.abort();
  }, DOWNLOAD_STALL_CHECK_MS);

  let paintedHasTotal: boolean | null = null;
  let paintedAt = -Infinity;
  const onProgress = (progress: MediaDownloadProgress) => {
    touch();
    const hasTotal = progress.total !== null;
    // Cabeçalho chegou (dica muda) ou 100%: pinta na hora; o resto, no máximo a cada 250 ms.
    const urgent = hasTotal !== paintedHasTotal || (hasTotal && progress.loaded >= (progress.total as number));
    if (!urgent && lastActivity - paintedAt < PROGRESS_PAINT_MS) return;
    paintedHasTotal = hasTotal;
    paintedAt = lastActivity;
    progressStore.set({ title: progressTitle(progress, locale), hint: progressHint(progress.total) });
  };
  const fetchOpts = { signal: controller.signal, onProgress, onFallback: touch };

  void (async () => {
    try {
      let blob: Blob;
      let savedName = filename;
      try {
        blob = await fetchMediaForDownload(url, filename, fetchOpts);
      } catch (err) {
        const fallbackUrl = options.fallbackUrl;
        if (!fallbackUrl || fallbackUrl === url || !isMediaGoneError(err)) throw err;
        savedName = options.fallbackFilename || filename;
        touch();
        blob = await fetchMediaForDownload(fallbackUrl, savedName, fetchOpts);
      }
      saveBlobToDevice(blob, savedName);
      toast.success(uiT("common.downloadSuccess", undefined, "Download realizado com sucesso!"), {
        id: toastId,
        description: undefined,
      });
    } catch (err) {
      lastErrorToastByUrl.set(url, toastId);
      const forget = () => {
        if (lastErrorToastByUrl.get(url) === toastId) lastErrorToastByUrl.delete(url);
      };
      if (!stalled && isMediaGoneError(err)) {
        const [title, description] = unavailableTexts();
        toast.error(title, { id: toastId, description, duration: 8_000, onAutoClose: forget, onDismiss: forget });
        return;
      }
      if (!stalled && isDefinitiveDownloadRefusal(err)) {
        toast.error(uiT("common.downloadError", undefined, "Erro ao baixar arquivo"), {
          id: toastId,
          description: undefined,
          duration: 8_000,
          onAutoClose: forget,
          onDismiss: forget,
        });
        return;
      }
      toast.error(uiT("common.downloadError", undefined, "Erro ao baixar arquivo"), {
        id: toastId,
        description: uiT(
          "common.downloadFailedHint",
          undefined,
          "A conexão caiu ou o servidor não entregou o arquivo. Tente novamente.",
        ),
        duration: 10_000,
        onAutoClose: forget,
        onDismiss: forget,
        action: {
          label: uiT("messageBubble.retry", undefined, "Tentar novamente"),
          onClick: () => downloadMediaFile(url, filename, options),
        },
      });
    } finally {
      clearInterval(watchdog);
      downloadingMedia.delete(url);
    }
  })();
}
