import { create } from "zustand";

const DRAFT_KEY_PREFIX = "chat-draft:";

function loadInitialDrafts(): Record<number, string> {
  if (typeof window === "undefined") return {};
  const out: Record<number, string> = {};
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(DRAFT_KEY_PREFIX)) continue;
      const id = Number(k.slice(DRAFT_KEY_PREFIX.length));
      if (!Number.isFinite(id) || id <= 0) continue;
      const v = window.localStorage.getItem(k);
      if (v) out[id] = v;
    }
  } catch { /* ignore */ }
  return out;
}

function persist(ticketId: number, text: string) {
  if (typeof window === "undefined") return;
  try {
    if (text) window.localStorage.setItem(`${DRAFT_KEY_PREFIX}${ticketId}`, text);
    else window.localStorage.removeItem(`${DRAFT_KEY_PREFIX}${ticketId}`);
  } catch { /* quota / private mode */ }
}

interface ChatDraftStore {
  drafts: Record<number, string>;
  setDraft: (ticketId: number, text: string) => void;
  clearDraft: (ticketId: number) => void;
  getDraft: (ticketId: number) => string;
  hasDraft: (ticketId: number) => boolean;
}

export const useChatDraftStore = create<ChatDraftStore>((set, get) => ({
  drafts: loadInitialDrafts(),
  setDraft: (ticketId, text) => {
    if (!ticketId) return;
    const current = get().drafts;
    if (text) {
      if (current[ticketId] === text) return;
      persist(ticketId, text);
      set({ drafts: { ...current, [ticketId]: text } });
    } else {
      if (!(ticketId in current)) return;
      persist(ticketId, "");
      const next = { ...current };
      delete next[ticketId];
      set({ drafts: next });
    }
  },
  clearDraft: (ticketId) => {
    const current = get().drafts;
    if (!(ticketId in current)) return;
    persist(ticketId, "");
    const next = { ...current };
    delete next[ticketId];
    set({ drafts: next });
  },
  getDraft: (ticketId) => get().drafts[ticketId] || "",
  hasDraft: (ticketId) => Boolean(get().drafts[ticketId]),
}));
