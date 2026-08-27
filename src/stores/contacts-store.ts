import { create } from "zustand";
import { fetchContacts, type Contact } from "@/services/contacts";

interface ContactsState {
  contacts: Contact[];
  total: number;
  loading: boolean;
  loaded: boolean;
  page: number;
  search: string;
  load: (search?: string, page?: number) => Promise<void>;
  setContacts: (contacts: Contact[], total?: number) => void;
  updateContactInList: (id: number, updates: Partial<Contact>) => void;
  removeContact: (id: number) => void;
  reset: () => void;
}

export const useContactsStore = create<ContactsState>((set, get) => ({
  contacts: [],
  total: 0,
  loading: false,
  loaded: false,
  page: 1,
  search: "",

  load: async (search, page) => {
    if (get().loading) return;
    const s = search ?? get().search;
    const p = page ?? get().page;
    set({ loading: true, search: s, page: p });
    try {
      const { data } = await fetchContacts({ searchParam: s, pageNumber: p });
      const result = data as Record<string, unknown>;
      const arr = (result?.contacts as Contact[]) || [];
      const total = (result?.count as number) || arr.length;
      set({ contacts: arr, total, loaded: true });
    } catch { /* empty */ }
    finally { set({ loading: false }); }
  },

  setContacts: (contacts, total) =>
    set({ contacts, total: total ?? contacts.length, loaded: true }),

  updateContactInList: (id, updates) =>
    set((s) => ({
      contacts: s.contacts.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    })),

  removeContact: (id) =>
    set((s) => ({
      contacts: s.contacts.filter((c) => c.id !== id),
      total: s.total - 1,
    })),
  reset: () => set({ contacts: [], total: 0, loading: false, loaded: false, page: 1, search: "" }),
}));
