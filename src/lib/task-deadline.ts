import { formatDate, formatDateTime, formatTime } from "@/lib/format";

/**
 * PLANO_TAREFAS_ATENDIMENTO_LEMBRETES §5.0/§5.2 — regra ÚNICA do prazo da tarefa na tela.
 * Espelho de backend/src/helpers/TodoDeadlineZPRO.ts (mudar um exige o outro).
 *
 * - "Para o dia" (`limitHasTime` diferente de true — backend antigo nem manda o campo):
 *   `limitDate` = meia-noite UTC do dia civil. O dia é a parte AAAA-MM-DD do valor e NUNCA
 *   passa pelo fuso do navegador (era o que fazia a tarefa de 15/10 aparecer como 14/10 e
 *   atrasar às 21h da véspera). Atrasa só quando o dia civil < hoje.
 * - Com hora (`limitHasTime === true`): `limitDate` é o instante; atrasa quando < agora.
 * - "Atrasada" também vale para `status === "delayed"` gravado à mão (como sempre).
 */

export interface TaskDeadlineLike {
  status?: string | null;
  limitDate?: string | null;
  dueDate?: string | null;
  limitHasTime?: boolean | null;
}

export type TaskDeadlineState = "done" | "overdue" | "today" | "upcoming" | "none";

export const TASK_REMINDER_OPTIONS = [0, 10, 30, 60] as const;
export type TaskReminderMinutes = (typeof TASK_REMINDER_OPTIONS)[number];

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Hoje (AAAA-MM-DD) no fuso do navegador. */
export function localToday(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Instante do fim do dia local (ISO), para "vence hoje" das tarefas com hora. */
export function localDayEndIso(now: Date = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0).toISOString();
}

function rawDeadline(task: TaskDeadlineLike): string | null {
  const value = task.limitDate || task.dueDate;
  return typeof value === "string" && value ? value : null;
}

export function isTimedTask(task: TaskDeadlineLike): boolean {
  return task.limitHasTime === true && !!rawDeadline(task);
}

/** Dia civil da tarefa "para o dia" (parte AAAA-MM-DD do valor gravado). */
export function taskCivilDay(task: TaskDeadlineLike): string | null {
  const value = rawDeadline(task);
  if (!value) return null;
  const day = value.slice(0, 10);
  return DAY_RE.test(day) ? day : null;
}

function taskInstant(task: TaskDeadlineLike): Date | null {
  const value = rawDeadline(task);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function taskDeadlineState(task: TaskDeadlineLike, now: Date = new Date()): TaskDeadlineState {
  if (task.status === "finished") return "done";
  if (task.status === "delayed") return "overdue";
  if (isTimedTask(task)) {
    const instant = taskInstant(task);
    if (!instant) return "none";
    if (instant.getTime() < now.getTime()) return "overdue";
    return localToday(instant) === localToday(now) ? "today" : "upcoming";
  }
  const day = taskCivilDay(task);
  if (!day) return "none";
  const today = localToday(now);
  if (day < today) return "overdue";
  return day === today ? "today" : "upcoming";
}

/** Prazo para exibir: dia inteiro só com a data; com hora, data e hora locais. */
export function formatTaskDeadline(task: TaskDeadlineLike): string | null {
  if (isTimedTask(task)) {
    const instant = taskInstant(task);
    return instant ? formatDateTime(instant, { dateStyle: "short", timeStyle: "short" }) : null;
  }
  const day = taskCivilDay(task);
  if (!day) return null;
  const [y, m, d] = day.split("-").map(Number);
  return formatDate(new Date(y, m - 1, d));
}

/** Só a hora local da tarefa com hora (para "vence às HH:mm"). */
export function formatTaskTime(task: TaskDeadlineLike): string | null {
  if (!isTimedTask(task)) return null;
  const instant = taskInstant(task);
  return instant ? formatTime(instant, { hour: "2-digit", minute: "2-digit" }) : null;
}

/** Valores dos campos Data/Hora para editar a tarefa. */
export function taskDeadlineInputs(task: TaskDeadlineLike): { date: string; time: string } {
  if (isTimedTask(task)) {
    const instant = taskInstant(task);
    if (!instant) return { date: "", time: "" };
    return { date: localToday(instant), time: `${pad(instant.getHours())}:${pad(instant.getMinutes())}` };
  }
  return { date: taskCivilDay(task) || "", time: "" };
}

/**
 * Corpo do prazo para gravar. Com hora: ISO montado pelos números locais (não depende do
 * parser de string do navegador). Sem hora: "AAAA-MM-DD" e sem lembrete.
 * `timeSupported` = backend com as colunas novas; sem ele manda só a data (como antes).
 */
export function buildTaskDeadlinePayload({
  date,
  time,
  reminderMinutes,
  timeSupported
}: {
  date: string;
  time?: string;
  reminderMinutes?: number | null;
  timeSupported: boolean;
}): { limitDate: string; limitHasTime?: boolean; reminderMinutes?: number | null } | null {
  const day = DAY_RE.exec(date || "");
  if (!day) return null;
  if (!timeSupported) return { limitDate: date };
  const clock = /^(\d{2}):(\d{2})$/.exec(time || "");
  if (!clock) return { limitDate: date, limitHasTime: false, reminderMinutes: null };
  const instant = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), Number(clock[1]), Number(clock[2]));
  if (Number.isNaN(instant.getTime())) return null;
  const minutes =
    reminderMinutes !== null && reminderMinutes !== undefined && (TASK_REMINDER_OPTIONS as readonly number[]).includes(reminderMinutes)
      ? reminderMinutes
      : null;
  return { limitDate: instant.toISOString(), limitHasTime: true, reminderMinutes: minutes };
}

const STATE_ORDER: Record<TaskDeadlineState, number> = { overdue: 0, today: 1, upcoming: 2, none: 3, done: 4 };

function sortKey(task: TaskDeadlineLike): number {
  if (isTimedTask(task)) return taskInstant(task)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const day = taskCivilDay(task);
  if (!day) return Number.MAX_SAFE_INTEGER;
  const [y, m, d] = day.split("-").map(Number);
  // Dia inteiro vale até o fim do dia: fica depois das tarefas com hora do mesmo dia.
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

/** Atrasadas → hoje → futuras → sem prazo → concluídas (cada grupo pelo prazo). */
export function sortTasksByDeadline<T extends TaskDeadlineLike>(list: T[], now: Date = new Date()): T[] {
  return [...list].sort((a, b) => {
    const byState = STATE_ORDER[taskDeadlineState(a, now)] - STATE_ORDER[taskDeadlineState(b, now)];
    if (byState !== 0) return byState;
    return sortKey(a) - sortKey(b);
  });
}
