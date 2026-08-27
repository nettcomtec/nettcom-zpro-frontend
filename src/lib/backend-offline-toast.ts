import { toast } from "sonner";
import { defaultLocale, locales, type Locale } from "@/i18n/config";
import { getMessages } from "@/i18n/get-messages";

const TOAST_ID = "backend-offline";
const MIN_INTERVAL_MS = 5000;
let lastShownAt = 0;

function getCurrentLocale(): Locale {
  if (typeof window === "undefined") return defaultLocale;
  try {
    const stored = localStorage.getItem("language") as Locale | null;
    if (stored && (locales as readonly string[]).includes(stored)) return stored;
  } catch {
    // noop
  }
  return defaultLocale;
}

export async function showBackendOfflineToast(): Promise<void> {
  if (typeof window === "undefined") return;

  const now = Date.now();
  if (now - lastShownAt < MIN_INTERVAL_MS) return;
  lastShownAt = now;

  const locale = getCurrentLocale();
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
