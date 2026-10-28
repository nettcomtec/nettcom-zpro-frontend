/**
 * Links para o Chat Privado (/chat-privado). A página abre a conversa pela query
 * `contactId` (conversa direta) ou `groupId` (equipe) — `userId` não é lido lá.
 */

export const INTERNAL_CHAT_PATH = "/chat-privado";

export type InternalChatTarget = { type: "private" | "group"; peerId: number };

function positiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function internalChatHref(target?: InternalChatTarget | null): string {
  const id = positiveInt(target?.peerId);
  if (!target || id == null) return INTERNAL_CHAT_PATH;
  return target.type === "group"
    ? `${INTERNAL_CHAT_PATH}?groupId=${id}`
    : `${INTERNAL_CHAT_PATH}?contactId=${id}`;
}

/** Só a página do Chat Privado; `/chat-interno-rc` (Rocket.Chat) é outra página. */
export function isInternalChatPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === INTERNAL_CHAT_PATH || pathname.startsWith(`${INTERNAL_CHAT_PATH}/`);
}
