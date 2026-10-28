import { getNativePlugin, isNativeApp } from "@/lib/native";

/**
 * Ponto único de download de arquivo gerado no navegador.
 *
 * - Navegador: link temporário com `download` (como sempre foi).
 * - App (Android/iOS) com o plugin nativo `ZproFiles`: o arquivo vai em base64 para o
 *   app, que abre a folha de compartilhar do sistema (Salvar em Arquivos, Drive,
 *   WhatsApp, e-mail). No WebView o link por blob não faz nada.
 * - App antigo, sem o plugin: devolve "app_outdated" para a tela avisar que é preciso
 *   atualizar o app (nunca tenta o blob, que ali não faz nada).
 *
 * Contrato com o app: `ZproFiles.share({ fileName, mimeType, base64 })` → `{ ok: true }`.
 */

export type DownloadFileResult = "downloaded" | "shared" | "app_outdated";

/**
 * Teto do arquivo que atravessa a ponte com o app. O base64 fica em várias cópias na
 * memória do WebView (leitura, recorte e mensagem da ponte), então o teto do front é bem
 * menor que o do nativo (25 MB). O export de avaliações fica em ~2 MB.
 */
export const NATIVE_SHARE_MAX_BYTES = 10 * 1024 * 1024;

/** Código do erro lançado acima do teto. */
export const DOWNLOAD_TOO_LARGE = "DOWNLOAD_TOO_LARGE";

const NATIVE_FILES_PLUGIN = "ZproFiles";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("FILE_READ_FAILED"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

function downloadInBrowser(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    document.body.removeChild(link);
    // Revogar na hora cancela o download em alguns navegadores.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * Dá para baixar arquivo aqui? Navegador sempre; app só com o plugin. Conferir ANTES de
 * buscar os dados, para o app antigo não gerar o arquivo inteiro só para ouvir "atualize".
 */
export function canDownloadFiles(): boolean {
  if (!isNativeApp()) return true;
  const plugin = getNativePlugin(NATIVE_FILES_PLUGIN);
  return !!plugin && typeof plugin.share === "function";
}

export async function downloadFile(blob: Blob, fileName: string): Promise<DownloadFileResult> {
  if (!isNativeApp()) {
    downloadInBrowser(blob, fileName);
    return "downloaded";
  }

  const plugin = getNativePlugin(NATIVE_FILES_PLUGIN);
  if (!plugin || typeof plugin.share !== "function") return "app_outdated";

  if (blob.size > NATIVE_SHARE_MAX_BYTES) throw new Error(DOWNLOAD_TOO_LARGE);

  const base64 = await blobToBase64(blob);
  try {
    await plugin.share({
      fileName,
      mimeType: blob.type || "application/octet-stream",
      base64,
    });
  } catch (err) {
    // Plugin anunciado pela ponte mas sem o método no nativo = app antigo.
    if ((err as { code?: unknown } | null)?.code === "UNIMPLEMENTED") return "app_outdated";
    throw err;
  }
  return "shared";
}
