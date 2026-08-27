import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UIState {
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  notificacaoTicket: boolean;
  recentPages: string[];
  tourActive: boolean;

  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setNotificacaoTicket: (value: boolean) => void;
  addRecentPage: (page: string) => void;
  setTourActive: (active: boolean) => void;
  reset: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      notificacaoTicket: true,
      recentPages: [],
      tourActive: false,

      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
      setNotificacaoTicket: (value) => set({ notificacaoTicket: value }),
      setTourActive: (active) => set({ tourActive: active }),
      addRecentPage: (page) =>
        set((state) => ({
          recentPages: [page, ...state.recentPages.filter((p) => p !== page)].slice(0, 10),
        })),
      reset: () => set({ mobileSidebarOpen: false, recentPages: [] }),
    }),
    {
      name: "zpro-ui",
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        sidebarCollapsed: state.sidebarCollapsed,
        notificacaoTicket: state.notificacaoTicket,
        recentPages: state.recentPages,
      }),
    }
  )
);
