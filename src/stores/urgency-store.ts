import { create } from "zustand";
import type { SentimentLevel } from "@/services/copilot";

interface TicketUrgencyEntry {
  sentiment: SentimentLevel;
  analyzedAt: number;
}

interface UrgencyStore {
  sentiments: Record<number, TicketUrgencyEntry>;
  /** Tickets currently being auto-analyzed. Used to render a loading indicator. */
  analyzing: Record<number, boolean>;
  setSentiment: (ticketId: number, sentiment: SentimentLevel) => void;
  /** Igual a setSentiment, mas permite hidratar com um timestamp passado
   *  (ex.: ticket.sentimentAnalyzedAt vindo do banco). */
  setSentimentWithTimestamp: (ticketId: number, sentiment: SentimentLevel, analyzedAt: number) => void;
  clearSentiment: (ticketId: number) => void;
  getSentiment: (ticketId: number) => TicketUrgencyEntry | undefined;
  isUrgent: (ticketId: number) => boolean;
  shouldReanalyze: (ticketId: number, staleMs?: number) => boolean;
  setAnalyzing: (ticketId: number, value: boolean) => void;
  isAnalyzing: (ticketId: number) => boolean;
}

export const useUrgencyStore = create<UrgencyStore>((set, get) => ({
  sentiments: {},
  analyzing: {},

  setSentiment: (ticketId, sentiment) =>
    set((state) => ({
      sentiments: {
        ...state.sentiments,
        [ticketId]: { sentiment, analyzedAt: Date.now() },
      },
    })),

  setSentimentWithTimestamp: (ticketId, sentiment, analyzedAt) =>
    set((state) => ({
      sentiments: {
        ...state.sentiments,
        [ticketId]: { sentiment, analyzedAt },
      },
    })),

  clearSentiment: (ticketId) =>
    set((state) => {
      const next = { ...state.sentiments };
      delete next[ticketId];
      return { sentiments: next };
    }),

  getSentiment: (ticketId) => get().sentiments[ticketId],

  isUrgent: (ticketId) => {
    const entry = get().sentiments[ticketId];
    return entry?.sentiment === "frustrated";
  },

  shouldReanalyze: (ticketId, staleMs = 5 * 60 * 1000) => {
    const entry = get().sentiments[ticketId];
    if (!entry) return true;
    return Date.now() - entry.analyzedAt > staleMs;
  },

  setAnalyzing: (ticketId, value) =>
    set((state) => {
      const next = { ...state.analyzing };
      if (value) next[ticketId] = true;
      else delete next[ticketId];
      return { analyzing: next };
    }),

  isAnalyzing: (ticketId) => !!get().analyzing[ticketId],
}));
