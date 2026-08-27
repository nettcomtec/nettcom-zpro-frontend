import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("pt-BR", options ?? { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + "...";
}

export function getInitials(name?: string | null): string {
  if (!name) return "?";
  const letters = name
    .split(" ")
    .map(n => [...n][0] ?? "")          // iterate by code points, not code units
    .filter(ch => /\p{L}/u.test(ch))    // keep only real letters (drop emoji, surrogates, symbols)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  if (letters) return letters;
  // Name is a phone number or purely numeric — use last 2 digits
  const digits = name.replace(/\D/g, "");
  if (digits.length >= 2) return digits.slice(-2);
  if (digits.length === 1) return digits;
  return "?";
}

/** Header de mídia de template WABA exige URL http(s) — texto comum no campo faz a
 *  Meta rejeitar com (#100) "image.link is not a valid URI". Use antes de enviar/salvar. */
export function isValidHttpUrl(value?: string | null): boolean {
  return /^https?:\/\/\S+$/i.test((value || "").trim());
}

/** Gera cor HSL determinística a partir do nome — cada contato tem sua própria cor */
export function getAvatarColor(name?: string | null): { background: string; color: string } {
  if (!name) return { background: "hsl(215,20%,65%)", color: "#fff" };
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return { background: `hsl(${hue},60%,48%)`, color: "#fff" };
}
