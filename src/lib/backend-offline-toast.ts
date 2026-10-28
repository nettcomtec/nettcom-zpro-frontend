import { toast } from "sonner";
import { getMessages } from "@/i18n/get-messages";
import { getUiLocale } from "./ui-locale";

const TOAST_ID = "backend-offline";
const MIN_INTERVAL_MS = 5000;
let lastShownAt = 0;

export async function showBackendOfflineToast(): Promise<void> {
  if (typeof window === "undefined") return;

  const now = Date.now();
  if (now - lastShownAt < MIN_INTERVAL_MS) return;
  lastShownAt = now;

  // Leitor único do idioma da tela (escolha explícita → dica da Região → pt).
  const locale = getUiLocale();
  let title = "Servidor temporariamente offline";
  let description = "Estamos reconectando. Tente novamente em instantes.";

  try {
    const messages = (await getMessages(locale)) as {
      backendOffline?: { title?: string; description?: string };
    };
    title = messages.backendOffline?.title ?? title;
    description = messages.backendOffline?.description ?? description;
  } catch {
    // noop — fallback usado
  }

  toast.error(title, { id: TOAST_ID, description });
}

export function dismissBackendOfflineToast(): void {
  toast.dismiss(TOAST_ID);
  lastShownAt = 0;
}
