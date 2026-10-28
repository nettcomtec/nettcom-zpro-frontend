import { toast } from "sonner";

// Arquivo escolhido no seletor do aparelho Android. Do Android 13 em diante o
// seletor de mídia do sistema entrega um atalho cuja data muda entre uma
// consulta e outra, e o navegador (sobretudo o WebView do app) recusa toda
// leitura dele: a bolha saía com a imagem quebrada e o envio falhava, também no
// "Tentar novamente" (bug do Chromium 40123366). Aqui a imagem/vídeo é lida
// inteira logo na escolha e a cópia em memória segue para prévia e envio; se
// nem essa leitura funciona, quem chama avisa em vez de anexar.
// Fora do Android, e para documento, nada muda. Acima do teto só passa por uma
// leitura curta de conferência (cópia de vídeo grande pesaria na memória).

const FULL_COPY_MAX_BYTES = 50 * 1024 * 1024;
// Teto somado das cópias de um campo (o que já está anexado conta junto): as
// cópias moram na memória do app, e estourar derruba a tela.
const COPY_BUDGET_BYTES = 150 * 1024 * 1024;
const PROBE_BYTES = 64 * 1024;
const READ_TIMEOUT_MS = 20_000;
// Aviso "Preparando arquivo..." só quando a leitura passa disso (foto comum
// termina antes e não pisca nada; fora do Android não há leitura).
const PREPARING_TOAST_DELAY_MS = 400;
// Um aviso de ilegível por vez, mesmo com vários arquivos recusados.
const UNREADABLE_TOAST_ID = "picked-file-unreadable";

export type PickedFileOptions = { preparingMessage?: string };

const isAndroidDevice = (): boolean =>
  typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent || "");

const isMediaFile = (file: File): boolean => /^(image|video)\//i.test(file.type || "");

// Só a recusa de leitura conta como ilegível; tempo esgotado e falta de memória
// mantêm o arquivo original (o envio segue como antes).
const isUnreadableError = (err: unknown): boolean => {
  const name = (err as { name?: string } | null)?.name;
  return name === "NotReadableError" || name === "NotFoundError";
};

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("read-timeout")), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });

async function withPreparingToast<T>(message: string | undefined, task: () => Promise<T>): Promise<T> {
  if (!message) return task();
  let toastId: string | number | undefined;
  const timer = setTimeout(() => { toastId = toast.loading(message); }, PREPARING_TOAST_DELAY_MS);
  try {
    return await task();
  } finally {
    clearTimeout(timer);
    if (toastId !== undefined) toast.dismiss(toastId);
  }
}

async function readPickedFile(file: File, budget?: { remaining: number }): Promise<File | null> {
  if (!isAndroidDevice() || !isMediaFile(file)) return file;
  // Mídia vazia nunca é uma foto/vídeo de verdade: é o atalho sem conteúdo.
  if (file.size === 0) return null;
  const canCopy = file.size <= FULL_COPY_MAX_BYTES && (!budget || budget.remaining >= file.size);
  try {
    if (canCopy) {
      if (budget) budget.remaining -= file.size;
      const bytes = await withTimeout(file.arrayBuffer(), READ_TIMEOUT_MS);
      if (bytes.byteLength === 0) return null;
      return new File([bytes], file.name, { type: file.type, lastModified: file.lastModified });
    }
    await withTimeout(file.slice(0, PROBE_BYTES).arrayBuffer(), READ_TIMEOUT_MS);
    return file;
  } catch (err) {
    return isUnreadableError(err) ? null : file;
  }
}

/** Arquivo pronto para anexar, ou null quando o aparelho não liberou a leitura. */
export function preparePickedFile(file: File, budget?: { remaining: number }, opts: PickedFileOptions = {}): Promise<File | null> {
  return withPreparingToast(opts.preparingMessage, () => readPickedFile(file, budget));
}

/** Orçamento de cópia de um campo, descontando o que já está anexado nele. */
export function pickedFilesBudget(attached: File[] = []): { remaining: number } {
  return { remaining: COPY_BUDGET_BYTES - attached.reduce((sum, f) => sum + f.size, 0) };
}

/** Vários arquivos de uma escolha, um por vez (sem picos de memória). */
export function preparePickedFiles(
  files: File[],
  budget: { remaining: number } = pickedFilesBudget(),
  opts: PickedFileOptions = {},
): Promise<{ ready: File[]; unreadable: number }> {
  return withPreparingToast(opts.preparingMessage, async () => {
    const ready: File[] = [];
    let unreadable = 0;
    for (const file of files) {
      const prepared = await readPickedFile(file, budget);
      if (prepared) ready.push(prepared);
      else unreadable++;
    }
    return { ready, unreadable };
  });
}

/**
 * Escolher de novo sem o seletor de mídia: o campo abre com "qualquer arquivo"
 * (vai ao app Arquivos) e volta ao filtro de antes logo depois do clique, que é
 * quando o navegador lê o filtro. Só funciona dentro de um toque do usuário.
 */
export function openPickedFileFallback(input: HTMLInputElement | null): void {
  if (!input) return;
  const previous = input.accept;
  input.accept = "*/*";
  input.click();
  input.accept = previous;
}

/**
 * Aviso de arquivo ilegível com o atalho "Abrir arquivos". Dentro de diálogo
 * modal o aviso não recebe toque (o Radix bloqueia o resto da página): ali o
 * aviso vai no próprio diálogo, com `openPickedFileFallback`.
 */
export function notifyUnreadablePickedFile(message: string, actionLabel: string, input: HTMLInputElement | null): void {
  toast.error(message, {
    id: UNREADABLE_TOAST_ID,
    duration: 10000,
    ...(input ? { action: { label: actionLabel, onClick: () => openPickedFileFallback(input) } } : {}),
  });
}
