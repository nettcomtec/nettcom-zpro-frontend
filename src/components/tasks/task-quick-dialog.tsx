"use client";

// PLANO_TAREFAS_ATENDIMENTO_LEMBRETES §5.5 — criar, editar e reagendar a tarefa do contato
// (card do atendimento e aba Relacionamento). Responsável começa no usuário logado (D4).
// Na edição só vai ao servidor o que mudou.

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TaskDeadlineFields, type TaskDeadlineValue } from "@/components/tasks/task-deadline-fields";
import { useLiveMode } from "@/hooks/use-live-mode";
import { isFeatureNotInPlanError } from "@/lib/api";
import { getBackendErrorCode } from "@/lib/backend-error-code";
import {
  TASK_REMINDER_OPTIONS, buildTaskDeadlinePayload, taskDeadlineInputs, taskDeadlineState,
} from "@/lib/task-deadline";
import { cn } from "@/lib/utils";
import { createTodoList, updateTodoList, type TodoItem, type TodoPayload } from "@/services/tasks";
import { fetchAllUsers } from "@/services/users";
import { useAuthStore } from "@/stores/auth-store";
import { useTaskSummaryStore } from "@/stores/task-summary-store";

export type TaskQuickDialogMode = "create" | "edit" | "reschedule";

export interface TaskQuickDialogSaved {
  mode: TaskQuickDialogMode;
  /** Corpo devolvido pelo servidor (null quando não veio objeto). */
  task: TodoItem | null;
  /** O que foi mandado ao servidor. */
  changes: Partial<TodoPayload>;
  /** Tarefa editada (null na criação). */
  targetId: number | null;
}

interface TaskQuickDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: TaskQuickDialogMode;
  /** Tarefa editada/reagendada (ignorada na criação). */
  task?: TodoItem | null;
  contactId: number;
  /** Atendimento a vincular na criação. */
  ticketId?: number | null;
  onSaved: (result: TaskQuickDialogSaved) => void;
  /** Falha na criação (o card decide se o backend não conhece o vínculo). */
  onCreateError?: (err: unknown) => void;
}

const ERROR_TOAST_KEYS: Record<string, string> = {
  ERR_TODO_INVALID_OWNER: "errInvalidOwner",
  ERR_TODO_INVALID_DEADLINE: "errInvalidDeadline",
  ERR_TODO_INVALID_REMINDER: "errInvalidReminder",
  ERR_TODO_TIME_NOT_READY: "errTimeNotReady",
  ERR_TODO_INVALID_LINK: "errInvalidLink",
};

/**
 * Chave (namespace `taskShared`) do toast de erro ao gravar tarefa; null = sem toast:
 * recurso fora do plano e falta de permissão já são avisados pelo layout.
 */
export function taskErrorToastKey(err: unknown): string | null {
  if (isFeatureNotInPlanError(err)) return null;
  const code = getBackendErrorCode(err);
  if (code === "ERR_FEATURE_NOT_IN_PLAN" || code === "ERR_NO_PERMISSION") return null;
  return ERROR_TOAST_KEYS[code] ?? "error";
}

/** Backend sem as colunas de hora: esconde Hora/Lembrete na hora (o resumo do header confirma depois). */
export function noteTaskTimeNotReady(err: unknown): void {
  if (getBackendErrorCode(err) === "ERR_TODO_TIME_NOT_READY") {
    useTaskSummaryStore.getState().setTimeSupported(false);
  }
}

interface AssignableUser {
  id: number;
  name: string;
}

// Lista de responsáveis guardada em memória do módulo (por empresa, renovada a cada 5 min):
// abrir o diálogo várias vezes não refaz a paginação de /users.
const USERS_TTL_MS = 5 * 60 * 1000;
let usersCache: { tenantId: number; at: number; list: AssignableUser[] } | null = null;
let usersInFlight: { tenantId: number; promise: Promise<AssignableUser[]> } | null = null;

function cachedAssignableUsers(tenantId: number | undefined): AssignableUser[] {
  return usersCache && tenantId && usersCache.tenantId === tenantId ? usersCache.list : [];
}

function loadAssignableUsers(tenantId: number): Promise<AssignableUser[]> {
  if (usersCache && usersCache.tenantId === tenantId && Date.now() - usersCache.at < USERS_TTL_MS) {
    return Promise.resolve(usersCache.list);
  }
  if (usersInFlight && usersInFlight.tenantId === tenantId) return usersInFlight.promise;
  const promise = fetchAllUsers()
    .then((res) => {
      const list = (res.data?.users ?? [])
        .filter((u) => u && u.profile !== "superadmin" && Number.isInteger(Number(u.id)) && Number(u.id) > 0)
        .map((u) => ({ id: Number(u.id), name: String(u.name || `#${u.id}`) }));
      usersCache = { tenantId, at: Date.now(), list };
      return list;
    })
    .finally(() => {
      if (usersInFlight?.promise === promise) usersInFlight = null;
    });
  usersInFlight = { tenantId, promise };
  return promise;
}

interface FormSnapshot {
  name: string;
  description: string;
  deadline: TaskDeadlineValue;
  ownerId: string;
}

const EMPTY_DEADLINE: TaskDeadlineValue = { date: "", time: "", reminderMinutes: null };

function reminderOf(task: TodoItem): number | null {
  const value = task.reminderMinutes;
  return task.limitHasTime === true && typeof value === "number" && (TASK_REMINDER_OPTIONS as readonly number[]).includes(value)
    ? value
    : null;
}

function snapshotOf(task: TodoItem | null | undefined, mode: TaskQuickDialogMode, currentUserId?: number): FormSnapshot {
  if (task && mode !== "create") {
    const inputs = taskDeadlineInputs(task);
    return {
      name: task.name || "",
      description: task.description || "",
      deadline: { date: inputs.date, time: inputs.time, reminderMinutes: reminderOf(task) },
      ownerId: task.ownerId ? String(task.ownerId) : "",
    };
  }
  return {
    name: "",
    description: "",
    deadline: { ...EMPTY_DEADLINE },
    ownerId: currentUserId ? String(currentUserId) : "",
  };
}

export function TaskQuickDialog({
  open,
  onOpenChange,
  mode,
  task,
  contactId,
  ticketId,
  onSaved,
  onCreateError,
}: TaskQuickDialogProps) {
  const t = useTranslations("taskShared");
  const { isLiveMode } = useLiveMode();
  const baseId = useId();
  const tenantId = useAuthStore((s) => s.user?.tenantId);
  const currentUserId = useAuthStore((s) => s.user?.userId);
  const currentUserName = useAuthStore((s) => s.user?.username);
  // Mesmo critério do backend (isAdminLike com tasks_view_all): quem não vê todas as tarefas
  // não verá a criada para um colega na própria lista (D32).
  const seesAllTasks = useAuthStore((s) => {
    const profile = s.user?.profile;
    if (profile === "admin" || profile === "superadmin" || profile === "super") return true;
    return profile === "custom" && s.hasPermission("tasks_view_all");
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState<TaskDeadlineValue>({ ...EMPTY_DEADLINE });
  const [ownerId, setOwnerId] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<AssignableUser[]>(() => cachedAssignableUsers(tenantId));

  const savingRef = useRef(false);
  const initialRef = useRef<FormSnapshot | null>(null);
  // A lista do card pode recarregar com o diálogo aberto (tempo real): o formulário só
  // é preenchido quando o diálogo abre, nunca a cada objeto novo da mesma tarefa.
  const taskRef = useRef<TodoItem | null | undefined>(task);
  taskRef.current = task;
  const taskId = task?.id ?? null;

  useEffect(() => {
    if (!open) return;
    const snapshot = snapshotOf(taskRef.current, mode, currentUserId);
    initialRef.current = snapshot;
    setName(snapshot.name);
    setDescription(snapshot.description);
    setDeadline(snapshot.deadline);
    setOwnerId(snapshot.ownerId);
    setAttempted(false);

    if (!tenantId) return;
    let cancelled = false;
    loadAssignableUsers(tenantId)
      .then((list) => {
        if (!cancelled) setUsers(list);
      })
      .catch(() => {
        // Sem a lista, o seletor mostra só o usuário logado (e o responsável atual na edição).
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, taskId, tenantId]);

  const ownerOptions = useMemo(() => {
    const list = [...users];
    const ensure = (id: number, label: string) => {
      if (id > 0 && !list.some((u) => u.id === id)) list.unshift({ id, name: label });
    };
    if (mode !== "create" && task?.ownerId) ensure(Number(task.ownerId), task.owner || `#${task.ownerId}`);
    if (currentUserId) ensure(Number(currentUserId), currentUserName || `#${currentUserId}`);
    return list;
  }, [users, mode, task?.ownerId, task?.owner, currentUserId, currentUserName]);

  const ownerName = (id: number): string => ownerOptions.find((u) => u.id === id)?.name || String(id);

  const close = () => onOpenChange(false);

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (savingRef.current) return;
    setAttempted(true);

    const current = taskRef.current;
    if (mode !== "create" && !current) return;

    const init = initialRef.current;
    const trimmedName = name.trim();
    const timeSupported = useTaskSummaryStore.getState().timeSupported === true;
    const deadlineChanged =
      mode === "create" ||
      !init ||
      deadline.date !== init.deadline.date ||
      deadline.time !== init.deadline.time ||
      deadline.reminderMinutes !== init.deadline.reminderMinutes;
    const deadlinePayload = deadline.date
      ? buildTaskDeadlinePayload({
          date: deadline.date,
          time: deadline.time,
          reminderMinutes: deadline.reminderMinutes,
          timeSupported,
        })
      : null;
    const needsName = mode !== "reschedule";
    const needsDate = mode !== "edit" || deadlineChanged;
    if ((needsName && !trimmedName) || (needsDate && !deadlinePayload)) {
      toast.error(t("required"));
      return;
    }

    if (mode === "create") {
      const owner = Number(ownerId);
      if (!Number.isInteger(owner) || owner <= 0 || !deadlinePayload) {
        toast.error(t("required"));
        return;
      }
      const payload: TodoPayload = {
        name: trimmedName,
        description: description.trim() || undefined,
        ...deadlinePayload,
        ownerId: owner,
        owner: ownerName(owner),
        status: "pending",
        priority: "none",
        contactId,
        ...(ticketId ? { ticketId } : {}),
      };
      savingRef.current = true;
      setSaving(true);
      try {
        const { data } = await createTodoList(payload);
        if (!seesAllTasks && owner !== Number(currentUserId)) {
          toast.success(t("createdForOther", { name: ownerName(owner) }));
        } else {
          toast.success(t("created"));
        }
        close();
        onSaved({
          mode,
          task: data && typeof data === "object" ? (data as TodoItem) : null,
          changes: payload,
          targetId: null,
        });
      } catch (err) {
        const key = taskErrorToastKey(err);
        if (key) toast.error(t(key));
        noteTaskTimeNotReady(err);
        onCreateError?.(err);
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
      return;
    }

    const target = current as TodoItem;
    const changes: Partial<TodoPayload> = {};
    if (mode === "edit") {
      if (trimmedName !== (target.name || "")) changes.name = trimmedName;
      const trimmedDescription = description.trim();
      if (trimmedDescription !== (target.description || "").trim()) changes.description = trimmedDescription;
      if (ownerId && ownerId !== (init?.ownerId ?? "")) {
        const owner = Number(ownerId);
        if (Number.isInteger(owner) && owner > 0) {
          changes.ownerId = owner;
          changes.owner = ownerName(owner);
        }
      }
    }
    if (deadlineChanged && deadlinePayload) {
      Object.assign(changes, deadlinePayload);
      // O servidor novo já troca "Atrasada" por "Pendente" quando o prazo vai para o futuro;
      // mandar junto mantém o mesmo resultado com o backend anterior (que não troca).
      const nextState = taskDeadlineState({
        status: "pending",
        limitDate: deadlinePayload.limitDate,
        limitHasTime: deadlinePayload.limitHasTime,
      });
      if (target.status === "delayed" && nextState !== "overdue") {
        changes.status = "pending";
      }
    }
    if (Object.keys(changes).length === 0) {
      close();
      return;
    }

    savingRef.current = true;
    setSaving(true);
    try {
      const { data } = await updateTodoList(target.id, changes);
      toast.success(t("updated"));
      close();
      onSaved({
        mode,
        task: data && typeof data === "object" ? (data as TodoItem) : null,
        changes,
        targetId: target.id,
      });
    } catch (err) {
      const key = taskErrorToastKey(err);
      if (key) toast.error(t(key));
      noteTaskTimeNotReady(err);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const title = mode === "create" ? t("newTask") : mode === "reschedule" ? t("rescheduleTitle") : t("editTask");
  const nameId = `${baseId}-name`;
  const descriptionId = `${baseId}-description`;
  const ownerSelectId = `${baseId}-owner`;
  const nameInvalid = attempted && !name.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && savingRef.current) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {mode === "reschedule" && task?.name && (
            <DialogDescription className={cn("break-words", isLiveMode && "live-blur-text")}>
              {task.name}
            </DialogDescription>
          )}
        </DialogHeader>

        <form id={`${baseId}-form`} className="space-y-3 py-1" onSubmit={(e) => void handleSubmit(e)} noValidate>
          {mode !== "reschedule" && (
            <>
              <div className="space-y-1">
                <Label htmlFor={nameId} className="text-xs">
                  {t("taskName")} *
                </Label>
                <Input
                  id={nameId}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("taskNamePlaceholder")}
                  disabled={saving}
                  aria-invalid={nameInvalid ? true : undefined}
                  className={cn("h-9", nameInvalid && "border-destructive")}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={descriptionId} className="text-xs">
                  {t("description")}
                </Label>
                <Textarea
                  id={descriptionId}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  disabled={saving}
                />
              </div>
            </>
          )}

          <TaskDeadlineFields
            value={deadline}
            onChange={setDeadline}
            idPrefix={`${baseId}-deadline`}
            disabled={saving}
            showDateError={attempted}
          />

          {mode !== "reschedule" && (
            <div className="space-y-1">
              <Label htmlFor={ownerSelectId} className="text-xs">
                {t("responsible")}
              </Label>
              <Select value={ownerId} onValueChange={setOwnerId} disabled={saving}>
                <SelectTrigger id={ownerSelectId} className="h-9">
                  <SelectValue placeholder={t("responsible")} />
                </SelectTrigger>
                <SelectContent>
                  {ownerOptions.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </form>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={close} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button type="submit" form={`${baseId}-form`} loading={saving}>
            {mode === "create" ? t("create") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
