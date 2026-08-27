import { create } from "zustand";
import { fetchAllUsers, type User } from "@/services/users";

interface UsersState {
  users: User[];
  loading: boolean;
  loaded: boolean;
  load: () => Promise<void>;
  setUsers: (users: User[]) => void;
  updateUserInList: (id: number, updates: Partial<User>) => void;
  removeUser: (id: number) => void;
  reset: () => void;
}

export const useUsersStore = create<UsersState>((set, get) => ({
  users: [],
  loading: false,
  loaded: false,

  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const { data } = await fetchAllUsers();
      set({ users: data.users, loaded: true });
    } catch { /* empty */ }
    finally { set({ loading: false }); }
  },

  setUsers: (users) => set({ users, loaded: true }),

  updateUserInList: (id, updates) =>
    set((s) => ({
      users: s.users.map((u) => (u.id === id ? { ...u, ...updates } : u)),
    })),

  removeUser: (id) =>
    set((s) => ({ users: s.users.filter((u) => u.id !== id) })),
  reset: () => set({ users: [], loading: false, loaded: false }),
}));
