import type { Locale } from "./config";

const messageCache = new Map<string, Record<string, unknown>>();

export async function getMessages(locale: Locale): Promise<Record<string, unknown>> {
  if (messageCache.has(locale)) {
    return messageCache.get(locale)!;
  }

  try {
    const messages = (await import(`./locales/${locale}.json`)).default;
    messageCache.set(locale, messages);
    return messages;
  } catch {
    if (locale !== "pt") {
      const fallback = (await import("./locales/pt.json")).default;
      messageCache.set(locale, fallback);
      return fallback;
    }
    return {};
  }
}
