import { create } from "zustand";

// Snapshot dos filtros ativos na pagina /atendimento. A pagina mantém o estado
// canônico em useState e sincroniza para esta store via useEffect. Hooks de socket
// (use-socket-tickets / use-socket-tickets-otm) leem daqui via getState() para
// decidir se um ticket recebido por socket deve entrar no store ou se deve ser
// descartado por estar fora do filtro ativo do usuario.
export interface TicketFilterSnapshot {
  selectedQueueIds: number[];
  selectedUserIds: string[];
  selectedTagIds: string[];
  selectedKanbanIds: string[];
  selectedWhatsappIds: number[];
  withUnreadMessages: boolean;
  dateFrom: string;
  dateTo: string;
  showAll: boolean;
  active: boolean;
}

interface TicketFilterState extends TicketFilterSnapshot {
  setFilterSnapshot: (snapshot: Partial<TicketFilterSnapshot>) => void;
  resetFilterSnapshot: () => void;
}

const initial: TicketFilterSnapshot = {
  selectedQueueIds: [],
  selectedUserIds: [],
  selectedTagIds: [],
  selectedKanbanIds: [],
  selectedWhatsappIds: [],
  withUnreadMessages: false,
  dateFrom: "",
  dateTo: "",
  showAll: false,
  active: false,
};

export const useTicketFilterStore = create<TicketFilterState>((set) => ({
  ...initial,
  setFilterSnapshot: (snapshot) => set(snapshot),
  resetFilterSnapshot: () => set(initial),
}));
