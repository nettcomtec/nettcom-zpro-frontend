"use client";

// PLANO_TAREFAS_ATENDIMENTO_LEMBRETES §5.5 — tarefas do contato. Um componente nos dois
// lugares: aba Gestão do painel do atendimento (coluna de ~360 px; tela cheia no celular)
// e aba Relacionamento da página do contato (D19). Lista todas as tarefas do contato que
// quem olha pode ver (D20; o escopo vem do backend), abertas primeiro.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  BellRing, CalendarClock, CheckCircle2, ChevronDown, ExternalLink, Info, Pencil, Plus, RotateCcw, RotateCw,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  TaskQuickDialog, taskErrorToastKey, type TaskQuickDialogMode, type TaskQuickDialogSaved,
} from "@/components/tasks/task-quick-dialog";
import { useLiveMode } from "@/hooks/use-live-mode";
import { getBackendErrorCode } from "@/lib/backend-error-code";
import { getSocket } from "@/lib/socket";
import {
  formatTaskDeadline, isTimedTask, sortTasksByDeadline, taskDeadlineState, type TaskDeadlineState,
} from "@/lib/task-deadline";
import { cn } from "@/lib/utils";
import { fetchTodoLists, updateTodoList, type TodoItem } from "@/services/tasks";
import { markTimeSupportedFromTasks } from "@/stores/task-summary-store";
import { usePageAccess } from "@/hooks/use-page-access";
import { useAuthStore } from "@/stores/auth-store";

export interface ContactTasksCardProps {
  contactId: number;
  /** Atendimento aberto (variant "ticket") ou dica da página do contato (variant "page"). */
  ticketId?: number | null;
  variant: "ticket" | "page";
  className?: string;
}

type LoadStatus = "loading" | "ok" | "error";

const SOCKET_DEBOUNCE_MS = 1000;
const CLOCK_TICK_MS = 60 * 1000;

const STATE_BADGE: Record<TaskDeadlineState, "destructive-soft" | "warning-soft" | "secondary" | "success-soft"> = {
  overdue: "destructive-soft",
  today: "warning-soft",
  upcoming: "secondary",
  none: "secondary",
  done: "success-soft",
};

const STATE_LABEL_KEY: Record<TaskDeadlineState, string> = {
  overdue: "stateOverdue",
  today: "stateToday",
  upcoming: "statePending",
  none: "statePending",
  done: "stateDone",
};

const REMINDER_LABEL_KEY: Record<number, string> = {
  0: "reminderAtTime",
  10: "reminder10",
  30: "reminder30",
  60: "reminder60",
};

function extractTodoList(res: unknown): unknown[] {
  if (Array.isArray(res)) return res;
  const r = res as { todoLists?: unknown; data?: unknown } | null;
  if (Array.isArray(r?.todoLists)) return r.todoLists as unknown[];
  if (Array.isArray(r?.data)) return r.data as unknown[];
  return [];
}

/** Backend com os vínculos de tarefa (PLANO_CRM_CONTATO D19) sempre manda a chave `contactId`. */
function hasContactLink(item: unknown): boolean {
  return !!item && typeof item === "object" && Object.prototype.hasOwnProperty.call(item, "contactId");
}

function errorStatus(err: unknown): number | undefined {
  const e = err as { status?: number; response?: { status?: number } } | null;
  return e?.status ?? e?.response?.status;
}

function withoutUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function ContactTasksCard({ contactId: contactIdProp, ticketId, variant, className }: ContactTasksCardProps) {
  const contactId = Number(contactIdProp);
  const t = useTranslations("taskShared");
  const tRelationship = useTranslations("relationship");
  const { isLiveMode } = useLiveMode();
  const blur = isLiveMode;

  // Seletores com o resultado: o card reage quando o plano ou o perfil são recarregados.
  const tasksEnabled = useAuthStore((s) => s.hasFeature("tasks"));
  const restricted = useAuthStore((s) => !!s.user && s.isRestrictedUser());
  const tenantId = useAuthStore((s) => s.user?.tenantId);
  const currentUserId = useAuthStore((s) => s.user?.userId);
  // Perfil não-custom sempre cria/edita (mesma regra do backend); custom só com a permissão.
  const canCreate = useAuthStore((s) => s.user?.profile !== "custom" || s.hasPermission("tasks_create"));
  const canEditAny = useAuthStore((s) => s.user?.profile !== "custom" || s.hasPermission("tasks_edit"));
  const active = tasksEnabled && !restricted && Number.isInteger(contactId) && contactId > 0;
  // "Abrir em Tarefas" só para quem abre a página: sem acesso o link levaria para fora do
  // atendimento (o card já mostra a tarefa e as ações).
  const canAccessTasksPage = usePageAccess("tarefas");

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [tasks, setTasks] = useState<TodoItem[]>([]);
  // Backend sem os vínculos de tarefa: a seção some em vez de mostrar tarefas de outros contatos.
  const [unsupported, setUnsupported] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [showDone, setShowDone] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<TaskQuickDialogMode>("create");
  const [dialogTask, setDialogTask] = useState<TodoItem | null>(null);

  const linksSeenRef = useRef(false);
  const requestSeq = useRef(0);
  const busyRef = useRef(false);
  const taskIdsRef = useRef<Set<number>>(new Set());
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    (silent: boolean) => {
      const seq = ++requestSeq.current;
      if (!silent) setStatus("loading");
      return fetchTodoLists({ contactId })
        .then(({ data }) => {
          if (seq !== requestSeq.current) return;
          const raw = extractTodoList(data);
          if (raw.some(hasContactLink)) linksSeenRef.current = true;
          markTimeSupportedFromTasks(raw);
          // Backend antigo ignora o filtro e devolve tudo: só fica o que é deste contato.
          const linked = raw.filter(
            (item): item is TodoItem =>
              hasContactLink(item) &&
              (item as TodoItem).contactId != null &&
              Number((item as TodoItem).contactId) === contactId
          );
          setTasks(linked);
          setStatus("ok");
        })
        .catch(() => {
          if (seq === requestSeq.current && !silent) setStatus("error");
        });
    },
    [contactId]
  );

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!active || unsupported) return;
    void load(false);
    return () => {
      requestSeq.current += 1;
    };
  }, [active, unsupported, load, reloadKey]);

  useEffect(() => {
    setShowDone(false);
    setDialogOpen(false);
  }, [contactId]);

  useEffect(() => {
    taskIdsRef.current = new Set(tasks.map((task) => Number(task.id)));
  }, [tasks]);

  // Estado "hoje"/"atrasada" muda com o relógio, não só com a lista.
  useEffect(() => {
    if (!active || tasks.length === 0) return;
    const id = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, [active, tasks.length]);

  // Tempo real: `${tenantId}:task:changed` chega só ao responsável da tarefa (sala do usuário),
  // então o card aberto por outra pessoa atualiza ao reabrir a aba (limitação aceita, AB10).
  useEffect(() => {
    if (!active || unsupported || !tenantId) return;
    const socket = getSocket();
    if (!socket) return;
    const event = `${tenantId}:task:changed`;
    const handler = (payload: unknown) => {
      const data = payload && typeof payload === "object" ? (payload as { id?: unknown; contactId?: unknown }) : {};
      const matches = Number(data.contactId) === contactId || taskIdsRef.current.has(Number(data.id));
      if (!matches) return;
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = setTimeout(() => {
        reloadTimerRef.current = null;
        void loadRef.current(true);
      }, SOCKET_DEBOUNCE_MS);
    };
    socket.on(event, handler);
    return () => {
      socket.off(event, handler);
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
    };
  }, [active, unsupported, tenantId, contactId]);

  const { openTasks, doneTasks, overdueCount } = useMemo(() => {
    const at = new Date(now);
    const sorted = sortTasksByDeadline(tasks, at);
    const open: TodoItem[] = [];
    const done: TodoItem[] = [];
    let overdue = 0;
    for (const task of sorted) {
      const state = taskDeadlineState(task, at);
      if (state === "done") done.push(task);
      else {
        open.push(task);
        if (state === "overdue") overdue += 1;
      }
    }
    done.sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
    return { openTasks: open, doneTasks: done, overdueCount: overdue };
  }, [tasks, now]);

  if (!active || unsupported) return null;

  const canEditTask = (task: TodoItem): boolean => {
    if (canEditAny) return true;
    const me = Number(currentUserId);
    return me > 0 && (Number(task.userId) === me || Number(task.ownerId) === me);
  };

  const openDialog = (mode: TaskQuickDialogMode, task: TodoItem | null) => {
    setDialogMode(mode);
    setDialogTask(task);
    setDialogOpen(true);
  };

  const handleSaved = ({ mode, task: saved, changes, targetId }: TaskQuickDialogSaved) => {
    if (mode === "create") {
      if (!saved || !hasContactLink(saved) || Number(saved.contactId) !== contactId) {
        // Criada sem o vínculo (backend anterior): só aparece em /tarefas.
        setUnsupported(true);
        return;
      }
      linksSeenRef.current = true;
      setTasks((prev) => [...prev.filter((item) => item.id !== saved.id), saved]);
      void load(true);
      return;
    }
    setTasks((prev) =>
      prev.map((item) =>
        item.id === targetId
          ? {
              ...item,
              ...withoutUndefined(changes),
              ...(saved && Number(saved.id) === targetId ? withoutUndefined(saved) : {}),
            }
          : item
      )
    );
  };

  const handleCreateError = (err: unknown) => {
    if (linksSeenRef.current) return;
    // Só recusa "de contrato" esconde a seção: rede, 5xx, sessão, plano, permissão e as
    // recusas próprias de tarefa (ERR_TODO_*, B9) não.
    const httpStatus = errorStatus(err);
    const contractRejection =
      httpStatus != null &&
      httpStatus >= 400 &&
      httpStatus < 500 &&
      ![401, 402, 403, 429].includes(httpStatus) &&
      !getBackendErrorCode(err).startsWith("ERR_TODO_");
    if (contractRejection) setUnsupported(true);
  };

  const applyStatus = async (task: TodoItem, nextStatus: "finished" | "pending") => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyId(task.id);
    try {
      const { data } = await updateTodoList(task.id, { status: nextStatus });
      const updated = data && typeof data === "object" && Number((data as TodoItem).id) === task.id ? (data as TodoItem) : null;
      setTasks((prev) =>
        prev.map((item) =>
          item.id === task.id ? { ...item, status: nextStatus, ...(updated ? withoutUndefined(updated) : {}) } : item
        )
      );
      toast.success(t("updated"));
    } catch (err) {
      const key = taskErrorToastKey(err);
      if (key) toast.error(t(key));
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  };

  const at = new Date(now);
  const actionsLocked = busyId != null;

  const renderTask = (task: TodoItem) => {
    const state = taskDeadlineState(task, at);
    const deadline = formatTaskDeadline(task);
    const busy = busyId === task.id;
    const editable = canEditTask(task);
    const fromThisTicket =
      variant === "ticket" && ticketId != null && task.ticketId != null && Number(task.ticketId) === Number(ticketId);
    const reminderKey =
      state !== "done" && isTimedTask(task) && typeof task.reminderMinutes === "number"
        ? REMINDER_LABEL_KEY[task.reminderMinutes]
        : undefined;
    const deadlineTone =
      state === "overdue" ? "text-destructive" : state === "today" ? "text-warning" : "text-muted-foreground";

    return (
      <li key={task.id} className="space-y-1.5 rounded-md border border-border/60 p-2">
        <div className="flex items-start gap-1.5">
          <p
            className={cn(
              "min-w-0 flex-1 break-words text-sm font-medium leading-snug",
              state === "done" && "text-muted-foreground line-through",
              blur && "live-blur-text"
            )}
          >
            {task.name}
          </p>
          {editable && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="-mr-1 -mt-0.5 shrink-0"
              onClick={() => openDialog("edit", task)}
              disabled={actionsLocked}
              aria-label={t("editTask")}
              title={t("editTask")}
            >
              <Pencil />
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge variant={STATE_BADGE[state]} className="px-1.5 py-0 text-[10px] font-medium">
            {t(STATE_LABEL_KEY[state])}
          </Badge>
          {deadline && (
            <span className={cn("inline-flex items-center gap-1 text-xs", deadlineTone)}>
              <CalendarClock className="h-3.5 w-3.5 shrink-0" />
              {deadline}
            </span>
          )}
          {reminderKey && (
            <span
              className="inline-flex items-center text-muted-foreground"
              title={t(reminderKey)}
              aria-label={t(reminderKey)}
            >
              <BellRing className="h-3.5 w-3.5" />
            </span>
          )}
          {fromThisTicket && (
            <Badge variant="info-soft" className="px-1.5 py-0 text-[10px] font-medium">
              {t("thisTicket")}
            </Badge>
          )}
        </div>

        {task.description && (
          <p
            className={cn(
              "line-clamp-2 whitespace-pre-wrap break-words text-xs text-muted-foreground",
              blur && "live-blur-text"
            )}
          >
            {task.description}
          </p>
        )}

        {task.owner && (
          <p className="break-words text-xs text-muted-foreground">{t("responsibleOf", { name: String(task.owner) })}</p>
        )}

        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          {editable &&
            (state === "done" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2"
                onClick={() => void applyStatus(task, "pending")}
                loading={busy}
                disabled={actionsLocked}
              >
                {!busy && <RotateCcw />}
                {t("reopen")}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => void applyStatus(task, "finished")}
                  loading={busy}
                  disabled={actionsLocked}
                >
                  {!busy && <CheckCircle2 />}
                  {t("complete")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => openDialog("reschedule", task)}
                  disabled={actionsLocked}
                >
                  <CalendarClock />
                  {t("reschedule")}
                </Button>
              </>
            ))}
          {canAccessTasksPage && (
            <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground">
              <Link href={`/tarefas?taskId=${task.id}`}>
                <ExternalLink />
                {t("openInTasks")}
              </Link>
            </Button>
          )}
        </div>
      </li>
    );
  };

  let body: ReactNode;
  if (status === "loading") {
    body = (
      <div className="space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="flex flex-col items-center gap-2 py-1 text-center">
        <p className="text-xs text-muted-foreground">{t("loadError")}</p>
        <Button type="button" variant="outline" size="sm" className="h-7 px-2" onClick={() => setReloadKey((k) => k + 1)}>
          <RotateCw />
          {tRelationship("retry")}
        </Button>
      </div>
    );
  } else if (tasks.length === 0) {
    body = <p className="py-1 text-xs text-muted-foreground">{t("noTasks")}</p>;
  } else {
    body = (
      <div className="space-y-2">
        {openTasks.length > 0 && <ul className="space-y-1.5">{openTasks.map(renderTask)}</ul>}
        {doneTasks.length > 0 && (
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground"
              onClick={() => setShowDone((value) => !value)}
              aria-expanded={showDone}
            >
              <ChevronDown className={cn("transition-transform", showDone && "rotate-180")} />
              {t("completedCount", { count: doneTasks.length })}
            </Button>
            {showDone && <ul className="mt-1.5 space-y-1.5">{doneTasks.map(renderTask)}</ul>}
          </div>
        )}
      </div>
    );
  }

  const createLinkTicketId = ticketId != null && Number(ticketId) > 0 ? Number(ticketId) : null;

  return (
    <Card className={className}>
      <CardHeader className="py-2">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex min-w-0 items-center gap-1.5 text-sm">
            <span className="truncate">{t("cardTitle")}</span>
            {status === "ok" && openTasks.length > 0 && (
              <span
                className={cn(
                  "inline-flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full px-1 text-[10px] leading-none",
                  overdueCount > 0 ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                {openTasks.length}
              </span>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label={t("cardTitle")}
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs font-normal">
                  {t("cardTooltip")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          {status === "ok" && canCreate && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 px-2"
              onClick={() => openDialog("create", null)}
            >
              <Plus />
              {t("newTask")}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="py-2 pt-0">{body}</CardContent>

      <TaskQuickDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        task={dialogTask}
        contactId={contactId}
        ticketId={createLinkTicketId}
        onSaved={handleSaved}
        onCreateError={handleCreateError}
      />
    </Card>
  );
}

export default ContactTasksCard;
