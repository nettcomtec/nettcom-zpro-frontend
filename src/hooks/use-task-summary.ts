"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import api, { BACKGROUND_REQUEST } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useAuthStore, type UserData } from "@/stores/auth-store";
import { useTaskSummaryStore } from "@/stores/task-summary-store";
import { fetchTodoLists, fetchTodoSummary, type TodoItem, type TodoSummary } from "@/services/tasks";
import { fetchUser } from "@/services/users";
import { usePageAccess } from "@/hooks/use-page-access";
import { formatTaskDeadline, formatTaskTime, localDayEndIso, localToday } from "@/lib/task-deadline";

/**
 * D23: tarefa pedida no /tarefas por quem não tem acesso à página (link do push/aviso). A
 * página grava e manda para a página inicial; o header lê, apaga e abre o detalhe no sino.
 */
export const OPEN_TASK_DETAIL_STORAGE_KEY = "zproOpenTaskDetail";

/** Idem para o push agrupado (`/tarefas?from=reminder`): abre a lista de tarefas do sino. */
export const OPEN_TASK_LIST_STORAGE_KEY = "zproOpenTaskList";

/** Payload de `${tenantId}:task:reminder` (vai só à sala do responsável). */
export interface TaskReminderEvent {
  id: number;
  kind: "reminder" | "overdue";
  name?: string | null;
  limitDate?: string | null;
  limitHasTime?: boolean | null;
  reminderMinutes?: number | null;
  ticketId?: number | null;
  contactId?: number | null;
}

interface UseTaskSummaryOptions {
  /** Fora de superadmin e só com o recurso `tasks` do plano. Desligado = nada é buscado. */
  enabled: boolean;
  /** D23: abre o detalhe da tarefa no sino (quem não tem acesso ao /tarefas). */
  onOpenTaskDetail: (taskId: number, fallback?: Partial<TodoItem>) => void;
  /** D23: "Ver tarefas" do resumo sem acesso ao /tarefas — abre a lista do sino. */
  onOpenTasksOverview: () => void;
  /** Tour de boas-vindas pendente ou na tela: o resumo do dia espera. */
  isTourBlocking: () => boolean;
  /** Reavalia o resumo quando o tour fecha. */
  tourActive: boolean;
}

const RELOAD_DEBOUNCE_MS = 1000;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const RECONNECT_RELOAD_AFTER_MS = 10 * 1000;
const DIGEST_DELAY_MS = 1500;
const REMINDER_TOAST_MS = 20000;
const DIGEST_TOAST_MS = 12000;
const REMINDER_SHOWN_PREFIX = "taskReminderShown:";
const REMINDER_SHOWN_TTL_MS = 2 * 24 * 60 * 60 * 1000;

function httpStatusOf(err: unknown): number | undefined {
  const e = err as { status?: number; response?: { status?: number } } | null;
  return e?.response?.status ?? e?.status;
}

function toCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* sem localStorage: vale só o que ficou no servidor */
  }
}

function digestStorageKey(tenantId: number, userId: number): string {
  return `tasksDigestDay:${tenantId}:${userId}`;
}

function configDigestDay(user: UserData | null | undefined): unknown {
  return (user?.configs as Record<string, unknown> | undefined)?.tasksDigestDay;
}

/** Exclusão entre abas (precedente: renovação do login em lib/api.ts). Sem a API, roda direto. */
async function runExclusive<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locks = (navigator as unknown as { locks?: { request: (n: string, cb: () => Promise<T>) => Promise<T> } }).locks;
  if (locks?.request) return locks.request(name, fn);
  return fn();
}

function pruneReminderMarks(now: number): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(REMINDER_SHOWN_PREFIX)) continue;
      let at = 0;
      try {
        at = Number((JSON.parse(localStorage.getItem(key) || "null") as { at?: number } | null)?.at) || 0;
      } catch {
        at = 0;
      }
      if (now - at >= REMINDER_SHOWN_TTL_MS) stale.push(key);
    }
    stale.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* ignora */
  }
}

/**
 * Uma aba por aviso: a primeira aba visível que chega grava a marca. A marca guarda o prazo
 * e o lembrete — tarefa reagendada que avisa de novo não é confundida com a repetição.
 */
function claimReminderToast(payload: TaskReminderEvent, kind: "reminder" | "overdue"): boolean {
  const key = `${REMINDER_SHOWN_PREFIX}${payload.id}:${kind}`;
  const due = `${payload.limitDate ?? ""}|${payload.reminderMinutes ?? ""}`;
  const now = Date.now();
  try {
    const previous = localStorage.getItem(key);
    if (previous) {
      const parsed = JSON.parse(previous) as { at?: number; due?: string } | null;
      if (parsed && parsed.due === due && typeof parsed.at === "number" && now - parsed.at < REMINDER_SHOWN_TTL_MS) {
        return false;
      }
    }
    pruneReminderMarks(now);
    localStorage.setItem(key, JSON.stringify({ at: now, due }));
  } catch {
    /* sem localStorage: só esta aba visível mostra */
  }
  return true;
}

/**
 * PLANO_TAREFAS_ATENDIMENTO_LEMBRETES §5.6 — resumo das MINHAS tarefas (sino e menu), aviso de
 * lembrete/atraso na tela e resumo 1 vez por dia. Montado UMA vez, no header.
 * - Backend antigo (sem `GET /todoLists/summary`): 1 carga da lista do usuário, como antes.
 * - Aviso na tela só na aba visível (o push sai pelo service worker de qualquer jeito).
 * - Sem acesso ao /tarefas (D23): "Abrir tarefa" abre o detalhe no sino.
 */
export function useTaskSummary({
  enabled,
  onOpenTaskDetail,
  onOpenTasksOverview,
  isTourBlocking,
  tourActive,
}: UseTaskSummaryOptions): { reload: () => void; canAccessTasksPage: boolean } {
  const t = useTranslations("taskShared");
  const router = useRouter();
  const tenantId = useAuthStore((s) => s.user?.tenantId);
  const userId = useAuthStore((s) => s.user?.userId);
  const canAccessTasksPage = usePageAccess("tarefas");

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const canAccessRef = useRef(canAccessTasksPage);
  canAccessRef.current = canAccessTasksPage;
  const onOpenTaskDetailRef = useRef(onOpenTaskDetail);
  onOpenTaskDetailRef.current = onOpenTaskDetail;
  const onOpenTasksOverviewRef = useRef(onOpenTasksOverview);
  onOpenTasksOverviewRef.current = onOpenTasksOverview;
  const isTourBlockingRef = useRef(isTourBlocking);
  isTourBlockingRef.current = isTourBlocking;
  const tRef = useRef(t);
  tRef.current = t;
  const routerRef = useRef(router);
  routerRef.current = router;

  const modeRef = useRef<"summary" | "fallback" | null>(null);
  const fallbackLoadedRef = useRef(false);
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);
  const lastLoadAtRef = useRef(0);
  const lastLoadStartRef = useRef(0);
  const lastLoadDayRef = useRef<string | null>(null);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const digestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const digestBusyRef = useRef(false);

  const openTasksPageOrBell = useCallback(() => {
    if (canAccessRef.current) routerRef.current.push("/tarefas");
    else onOpenTasksOverviewRef.current();
  }, []);

  const patchDigestDay = useCallback((day: string) => {
    const current = useAuthStore.getState().user;
    if (!current || configDigestDay(current) === day) return;
    useAuthStore.getState().patchUser({
      configs: { ...(current.configs || {}), tasksDigestDay: day } as UserData["configs"],
    });
  }, []);

  const maybeShowDigest = useCallback(() => {
    if (!enabledRef.current || digestBusyRef.current) return;
    if (document.visibilityState !== "visible") return;
    const summary = useTaskSummaryStore.getState();
    if (summary.supported !== true || summary.overdue + summary.today <= 0) return;
    const day = localToday();
    // Contagem de outro dia (aba que voltou depois da meia-noite): espera a nova carga.
    if (lastLoadDayRef.current !== day) return;
    if (isTourBlockingRef.current()) return;
    const user = useAuthStore.getState().user;
    if (!user?.userId || !user.tenantId) return;
    if (configDigestDay(user) === day) return;
    const storageKey = digestStorageKey(user.tenantId, user.userId);
    if (safeGet(storageKey) === day) return;

    digestBusyRef.current = true;
    runExclusive("zpro-task-digest", async () => {
      if (safeGet(storageKey) === day) return;
      // D15: o resumo é 1 vez por dia POR USUÁRIO — outro aparelho pode já ter mostrado hoje.
      try {
        const { data } = await fetchUser(user.userId);
        const fresh = (data as { configs?: Record<string, unknown> } | null)?.configs;
        if (fresh && fresh.tasksDigestDay === day) {
          safeSet(storageKey, day);
          patchDigestDay(day);
          return;
        }
      } catch {
        /* sem confirmação do servidor: segue com o que este aparelho sabe */
      }
      const current = useTaskSummaryStore.getState();
      if (!enabledRef.current || current.supported !== true) return;
      if (current.overdue + current.today <= 0) return;
      if (document.visibilityState !== "visible" || localToday() !== day) return;
      if (isTourBlockingRef.current()) return;

      safeSet(storageKey, day);
      const tr = tRef.current;
      const parts: string[] = [];
      if (current.overdue > 0) parts.push(tr("digestOverdue", { count: current.overdue }));
      if (current.today > 0) parts.push(tr("digestToday", { count: current.today }));
      toast(tr("digestTitle"), {
        id: "task-digest",
        description: parts.join(", "),
        duration: DIGEST_TOAST_MS,
        action: { label: tr("openTasks"), onClick: () => openTasksPageOrBell() },
      });
      patchDigestDay(day);
      // Backend antigo recusa a chave nova para quem não é admin (403): fica só a marca local.
      api
        .put(`/users/${user.userId}/configs`, { tasksDigestDay: day }, { ...BACKGROUND_REQUEST, skipNoPermissionToast: true })
        .catch(() => {});
    })
      .catch(() => {})
      .finally(() => {
        digestBusyRef.current = false;
      });
  }, [openTasksPageOrBell, patchDigestDay]);

  const scheduleDigestCheck = useCallback(() => {
    if (digestTimerRef.current) clearTimeout(digestTimerRef.current);
    digestTimerRef.current = setTimeout(() => {
      digestTimerRef.current = null;
      maybeShowDigest();
    }, DIGEST_DELAY_MS);
  }, [maybeShowDigest]);

  const loadRef = useRef<() => Promise<void>>(async () => {});
  loadRef.current = async () => {
    if (!enabledRef.current) return;
    if (inFlightRef.current) {
      queuedRef.current = true;
      return;
    }
    inFlightRef.current = true;
    lastLoadStartRef.current = Date.now();
    const day = localToday();
    try {
      if (modeRef.current !== "fallback") {
        try {
          const { data } = await fetchTodoSummary({ today: day, dayEnd: localDayEndIso() });
          if (!enabledRef.current) return;
          const body = (data || {}) as Partial<TodoSummary>;
          useTaskSummaryStore.getState().setSummary({
            overdue: toCount(body.overdue),
            today: toCount(body.today),
            items: Array.isArray(body.items) ? body.items : [],
            timeSupported: body.deadlineTimeSupported === true,
          });
          modeRef.current = "summary";
          lastLoadAtRef.current = Date.now();
          lastLoadDayRef.current = day;
          scheduleDigestCheck();
          return;
        } catch (err) {
          const status = httpStatusOf(err);
          // Falha passageira: mantém o último resumo e tenta no próximo ciclo.
          if (status !== 404 && status !== 400) return;
          modeRef.current = "fallback";
        }
      }
      // Backend antigo: a lista do próprio usuário, 1 vez (caminho de antes).
      if (fallbackLoadedRef.current) return;
      fallbackLoadedRef.current = true;
      try {
        const me = useAuthStore.getState().user?.userId;
        const { data } = await fetchTodoLists({ mine: true });
        if (!enabledRef.current) return;
        const raw = data as unknown;
        const list = Array.isArray(raw)
          ? raw
          : Array.isArray((raw as { todoLists?: unknown[] })?.todoLists)
            ? (raw as { todoLists: unknown[] }).todoLists
            : [];
        useTaskSummaryStore.getState().setFallback(
          (list as TodoItem[]).filter(
            (task) => task.ownerId === me && (task.status === "pending" || task.status === "delayed"),
          ),
        );
        lastLoadAtRef.current = Date.now();
        lastLoadDayRef.current = day;
      } catch {
        fallbackLoadedRef.current = false;
      }
    } finally {
      inFlightRef.current = false;
      if (queuedRef.current) {
        queuedRef.current = false;
        void loadRef.current();
      }
    }
  };

  const scheduleReload = useCallback((delay = RELOAD_DEBOUNCE_MS) => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => {
      reloadTimerRef.current = null;
      void loadRef.current();
    }, delay);
  }, []);

  const showReminderToast = useCallback(
    (payload: TaskReminderEvent, kind: "reminder" | "overdue") => {
      const tr = tRef.current;
      const name = (payload.name || "").trim() || `#${payload.id}`;
      const deadline = { limitDate: payload.limitDate ?? null, limitHasTime: payload.limitHasTime === true };
      const time = formatTaskTime(deadline) || formatTaskDeadline(deadline) || "";
      const fallback: Partial<TodoItem> = {
        name: payload.name || "",
        status: "pending",
        limitDate: payload.limitDate || undefined,
        limitHasTime: payload.limitHasTime === true,
        reminderMinutes: payload.reminderMinutes ?? null,
        ticketId: payload.ticketId ?? null,
        contactId: payload.contactId ?? null,
      };
      const action = {
        label: tr("openTask"),
        onClick: () => {
          if (canAccessRef.current) routerRef.current.push(`/tarefas?taskId=${payload.id}`);
          else onOpenTaskDetailRef.current(payload.id, fallback);
        },
      };
      const toastId = `task-${kind}-${payload.id}`;
      if (kind === "overdue") {
        toast.warning(tr("overdueToastTitle"), {
          id: toastId,
          description: tr("overdueToastBody", { name, time }),
          duration: REMINDER_TOAST_MS,
          action,
        });
        return;
      }
      toast.info(tr("reminderToastTitle"), {
        id: toastId,
        description:
          payload.reminderMinutes === 0 ? tr("reminderToastNow", { name }) : tr("reminderToastBody", { name, time }),
        duration: REMINDER_TOAST_MS,
        action,
      });
    },
    [],
  );

  // Carga inicial, tempo real, volta da aba e ciclo de 5 min.
  useEffect(() => {
    if (!enabled || !tenantId || !userId) {
      modeRef.current = null;
      fallbackLoadedRef.current = false;
      lastLoadDayRef.current = null;
      if (!enabled) useTaskSummaryStore.getState().reset();
      return;
    }

    void loadRef.current();

    const socket = getSocket();
    const changedEvent = `${tenantId}:task:changed`;
    const reminderEvent = `${tenantId}:task:reminder`;

    const onChanged = () => scheduleReload();
    const onReminder = (payload: TaskReminderEvent) => {
      scheduleReload();
      if (!payload || typeof payload.id !== "number") return;
      if (document.visibilityState !== "visible") return;
      const kind = payload.kind === "overdue" ? "overdue" : "reminder";
      runExclusive("zpro-task-reminder", async () => claimReminderToast(payload, kind))
        .then((claimed) => {
          if (claimed) showReminderToast(payload, kind);
        })
        .catch(() => {});
    };
    // Reconexão: o que chegou com o socket fora do ar se perdeu.
    const onConnect = () => {
      if (Date.now() - lastLoadStartRef.current > RECONNECT_RELOAD_AFTER_MS) scheduleReload();
    };

    socket.on(changedEvent, onChanged);
    socket.on(reminderEvent, onReminder);
    socket.on("connect", onConnect);

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const stale =
        Date.now() - lastLoadAtRef.current > REFRESH_INTERVAL_MS || lastLoadDayRef.current !== localToday();
      if (stale) void loadRef.current();
      else maybeShowDigest();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void loadRef.current();
    }, REFRESH_INTERVAL_MS);

    return () => {
      socket.off(changedEvent, onChanged);
      socket.off(reminderEvent, onReminder);
      socket.off("connect", onConnect);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(interval);
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
      if (digestTimerRef.current) {
        clearTimeout(digestTimerRef.current);
        digestTimerRef.current = null;
      }
    };
  }, [enabled, tenantId, userId, scheduleReload, maybeShowDigest, showReminderToast]);

  // Tour fechou: o resumo do dia que esperava pode aparecer agora.
  useEffect(() => {
    if (!enabled || tourActive) return;
    const timer = setTimeout(() => maybeShowDigest(), DIGEST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [enabled, tourActive, maybeShowDigest]);

  // Curto e agrupado com o `task:changed` que o próprio servidor emite logo depois.
  const reload = useCallback(() => scheduleReload(300), [scheduleReload]);

  return { reload, canAccessTasksPage };
}
