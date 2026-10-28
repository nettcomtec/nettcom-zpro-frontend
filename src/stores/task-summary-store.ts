import { create } from "zustand";
import type { TodoItem } from "@/services/tasks";

/**
 * PLANO_TAREFAS_ATENDIMENTO_LEMBRETES §5.2 — resumo das tarefas DO usuário logado (sino,
 * menu lateral e campos de prazo). Preenchido só pelo hook `use-task-summary` (montado uma
 * vez no header).
 * - `supported`: backend com `GET /todoLists/summary` (null = ainda não sabe).
 * - `timeSupported`: backend com as colunas de hora/lembrete (null = ainda não sabe; a tela só
 *   mostra Hora e Lembrete com `true` — sem elas a hora seria gravada como instante cru e a
 *   tarefa mudaria de dia).
 */
interface TaskSummaryState {
  overdue: number;
  today: number;
  items: TodoItem[];
  loaded: boolean;
  supported: boolean | null;
  timeSupported: boolean | null;
  setSummary: (data: { overdue: number; today: number; items: TodoItem[]; timeSupported: boolean }) => void;
  setFallback: (items: TodoItem[]) => void;
  setTimeSupported: (value: boolean) => void;
  reset: () => void;
}

const INITIAL = {
  overdue: 0,
  today: 0,
  items: [] as TodoItem[],
  loaded: false,
  supported: null as boolean | null,
  timeSupported: null as boolean | null
};

/**
 * Tarefa que já vem com a chave `limitHasTime` prova que o backend tem as colunas novas (sem
 * elas o atributo sai do model e a chave nem aparece). Serve quando o resumo falhou de passagem:
 * sem isto Hora/Lembrete sumiriam e reagendar uma tarefa com hora para outro dia apagaria a hora.
 */
export function markTimeSupportedFromTasks(list: unknown[]): void {
  if (useTaskSummaryStore.getState().timeSupported === true) return;
  const proves = list.some(
    (item) => !!item && typeof item === "object" && Object.prototype.hasOwnProperty.call(item, "limitHasTime")
  );
  if (proves) useTaskSummaryStore.getState().setTimeSupported(true);
}

export const useTaskSummaryStore = create<TaskSummaryState>((set) => ({
  ...INITIAL,
  setSummary: ({ overdue, today, items, timeSupported }) =>
    set({ overdue, today, items, timeSupported, loaded: true, supported: true }),
  setFallback: (items) => set({ items, loaded: true, supported: false, timeSupported: false }),
  setTimeSupported: (value) => set({ timeSupported: value }),
  reset: () => set({ ...INITIAL })
}));
