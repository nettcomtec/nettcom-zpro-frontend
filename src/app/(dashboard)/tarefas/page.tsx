"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/layout/empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import { useSortable } from "@/hooks/use-sortable";
import { useTouchDrag } from "@/hooks/use-touch-drag";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  CheckSquare, Plus, Search, Pencil, Trash2,
  LayoutList, Kanban as KanbanIcon, GripVertical, ContactRound, Info, MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchTodoLists, createTodoList, updateTodoList, deleteTodoList,
  type TodoItem, type TodoPayload,
} from "@/services/tasks";
import { fetchAllUsers, type User } from "@/services/users";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { useAuthStore } from "@/stores/auth-store";
import { useLiveMode } from "@/hooks/use-live-mode";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TaskDeadlineFields, type TaskDeadlineValue } from "@/components/tasks/task-deadline-fields";
import { ContactPicker, type ContactPickerValue } from "@/components/contatos/contact-picker";
import { markTimeSupportedFromTasks, useTaskSummaryStore } from "@/stores/task-summary-store";
import { OPEN_TASK_DETAIL_STORAGE_KEY, OPEN_TASK_LIST_STORAGE_KEY } from "@/hooks/use-task-summary";
import { getBackendErrorCode } from "@/lib/backend-error-code";
import {
  buildTaskDeadlinePayload,
  formatTaskDeadline,
  isTimedTask,
  sortTasksByDeadline,
  taskDeadlineInputs,
  taskDeadlineState,
} from "@/lib/task-deadline";

const STATUS_VARIANT_MAP: Record<string, "secondary" | "default" | "destructive" | "outline" | "warning"> = {
  pending: "secondary",
  delayed: "destructive",
  finished: "outline",
};

const PRIORITY_VARIANT_MAP: Record<string, "secondary" | "default" | "destructive" | "outline" | "warning"> = {
  none: "secondary",
  low: "secondary",
  medium: "warning",
  high: "destructive",
};

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-orange-400",
  low: "bg-blue-400",
  none: "bg-muted-foreground/30",
};

// ─── Prazo (PLANO_TAREFAS_ATENDIMENTO_LEMBRETES §5.0) ─────────────────────────
// "Atrasada" é calculada pelo prazo (D18) para exibir, agrupar e ordenar — nunca trocada
// em memória (era o que gravava `delayed` de volta ao salvar e prendia o atraso). O
// formulário mostra o status GRAVADO.

type KanbanColumnId = "pending" | "delayed" | "finished";

function displayStatusOf(task: TodoItem, now?: Date): KanbanColumnId {
  if (task.status === "finished") return "finished";
  return taskDeadlineState(task, now) === "overdue" ? "delayed" : "pending";
}

function deadlineTextClass(task: TodoItem): string {
  const state = taskDeadlineState(task);
  if (state === "overdue") return "text-destructive font-semibold";
  if (state === "today") return "text-amber-600 dark:text-amber-400 font-medium";
  return "text-muted-foreground";
}

const EMPTY_DEADLINE: TaskDeadlineValue = { date: "", time: "", reminderMinutes: null };

function deadlineValueOf(task: TodoItem): TaskDeadlineValue {
  const { date, time } = taskDeadlineInputs(task);
  return { date, time, reminderMinutes: isTimedTask(task) ? task.reminderMinutes ?? null : null };
}

function sameDeadlineValue(a: TaskDeadlineValue, b: TaskDeadlineValue): boolean {
  return a.date === b.date && (a.time || "") === (b.time || "") && (a.reminderMinutes ?? null) === (b.reminderMinutes ?? null);
}

/** Recusas do backend novo (ERR_TODO_*) → chave em `taskShared`. */
const TODO_ERROR_KEYS: Record<string, string> = {
  ERR_TODO_INVALID_OWNER: "errInvalidOwner",
  ERR_TODO_INVALID_DEADLINE: "errInvalidDeadline",
  ERR_TODO_INVALID_REMINDER: "errInvalidReminder",
  ERR_TODO_TIME_NOT_READY: "errTimeNotReady",
  ERR_TODO_INVALID_LINK: "errInvalidLink",
};

function parseTaskIdParam(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// ─── Contato vinculado (PLANO_CRM_CONTATO D19) ───────────────────────────────
// Backend antigo não manda `contact`: o chip simplesmente não aparece. Usuário
// restrito não vê o chip (nome do contato), como o "Ver perfil" do funil.
// O link não é arrastável e não propaga clique/toque: arrastar o card segue
// funcionando e tocar no chip não dispara o arraste por toque do kanban.

function TaskContactChip({ contact, className }: { contact?: TodoItem["contact"]; className?: string }) {
  const t = useTranslations("relationship");
  const { isLiveMode } = useLiveMode();
  const isRestricted = useAuthStore((s) => s.isRestrictedUser());
  if (!contact?.id || isRestricted) return null;
  const name = contact.name || `#${contact.id}`;
  return (
    <div className={cn("min-w-0", className)}>
      <Link
        href={`/contatos/${contact.id}`}
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        className="inline-flex max-w-[14rem] items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
        title={isLiveMode ? undefined : name}
      >
        <ContactRound className="h-3 w-3 shrink-0" />
        <span className={cn("truncate", isLiveMode && "live-blur-text")}>
          {t("taskContact", { name })}
        </span>
      </Link>
    </div>
  );
}

// ─── Kanban Card ─────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: TodoItem;
  priorityMap: Record<string, { label: string; variant: "secondary" | "default" | "destructive" | "outline" | "warning" }>;
  onDragStart: (task: TodoItem) => void;
  onDragEnd: () => void;
  onEdit: (task: TodoItem) => void;
  onDelete: (id: number) => void;
  onToggleFinished: (task: TodoItem) => void;
  isAdmin: boolean;
  t: (key: string) => string;
  onTouchStart: (e: React.TouchEvent<HTMLElement>, item: TodoItem) => void;
}

function TaskCard({ task, priorityMap, onDragStart, onDragEnd, onEdit, onDelete, onToggleFinished, isAdmin, t, onTouchStart }: TaskCardProps) {
  const deadline = formatTaskDeadline(task);
  const pr = priorityMap[task.priority || "none"] || priorityMap.none;
  const ownerName = task.owner || task.user?.name;
  const dotColor = PRIORITY_DOT[task.priority || "none"] ?? PRIORITY_DOT.none;

  return (
    <div
      draggable
      onDragStart={() => onDragStart(task)}
      onDragEnd={onDragEnd}
      onTouchStart={(e) => onTouchStart(e, task)}
      className="bg-card border rounded-lg shadow-sm p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-all select-none [-webkit-touch-callout:none] group"
    >
      {/* Priority bar */}
      <div className={cn("h-1 w-full rounded-full mb-2.5", dotColor)} />

      {/* Header: checkbox + title */}
      <div className="flex items-start gap-2">
        <Checkbox
          checked={task.status === "finished"}
          onCheckedChange={() => onToggleFinished(task)}
          className="mt-0.5 shrink-0"
        />
        <p className={cn(
          "font-medium text-sm leading-snug flex-1",
          task.status === "finished" && "line-through text-muted-foreground"
        )}>
          {task.name}
        </p>
        <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Description */}
      {task.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mt-1.5 pl-6">{task.description}</p>
      )}

      <TaskContactChip contact={task.contact} className="mt-1.5 pl-6" />

      {/* Footer */}
      <div className="mt-2.5 pl-6 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Badge variant={pr.variant as "secondary"} className="text-xs px-1.5 py-0">{pr.label}</Badge>
          {deadline && (
            <span className={cn("text-xs tabular-nums", deadlineTextClass(task))}>
              {deadline}
            </span>
          )}
        </div>
        {ownerName && (
          <p className="text-xs text-muted-foreground truncate">{ownerName}</p>
        )}
      </div>

      {/* Actions (visible on hover) */}
      <div className="flex gap-0.5 mt-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onEdit(task)}>
          <Pencil className="h-3 w-3" />
        </Button>
        {isAdmin && (
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => onDelete(task.id)}>
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

interface KanbanColDef {
  id: string;
  label: string;
  dotColor: string;
  headerClass: string;
  dropClass: string;
}

interface KanbanColumnProps {
  col: KanbanColDef;
  tasks: TodoItem[];
  isOver: boolean;
  onDragEnter: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: () => void;
  priorityMap: Record<string, { label: string; variant: "secondary" | "default" | "destructive" | "outline" | "warning" }>;
  onDragStart: (task: TodoItem) => void;
  onDragEnd: () => void;
  onEdit: (task: TodoItem) => void;
  onDelete: (id: number) => void;
  onToggleFinished: (task: TodoItem) => void;
  isAdmin: boolean;
  t: (key: string) => string;
  onTouchStart: (e: React.TouchEvent<HTMLElement>, item: TodoItem) => void;
}

function KanbanColumn({
  col, tasks, isOver,
  onDragEnter, onDragOver, onDragLeave, onDrop,
  priorityMap, onDragStart, onDragEnd, onEdit, onDelete, onToggleFinished,
  isAdmin, t, onTouchStart,
}: KanbanColumnProps) {
  return (
    <div className="flex-shrink-0 w-72 flex flex-col max-h-full">
      {/* Header */}
      <div className={cn("rounded-t-xl px-3 py-2.5 flex items-center gap-2", col.headerClass)}>
        <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", col.dotColor)} />
        <span className="font-semibold text-sm flex-1">{col.label}</span>
        <Badge variant="secondary" className="rounded-full text-xs min-w-[1.4rem] justify-center">
          {tasks.length}
        </Badge>
      </div>

      {/* Drop zone */}
      <div
        className={cn(
          "flex-1 rounded-b-xl p-2 space-y-2 min-h-[120px] transition-colors border border-t-0",
          col.dropClass,
          isOver && "ring-2 ring-primary ring-inset bg-primary/5"
        )}
        data-col-id={col.id}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {tasks.length === 0 ? (
          <div className="text-xs text-muted-foreground/60 text-center py-6 select-none">
            {t("kanbanDragHere")}
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              priorityMap={priorityMap}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleFinished={onToggleFinished}
              isAdmin={isAdmin}
              t={t}
              onTouchStart={onTouchStart}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// Casca do acesso: o acesso muda no meio da sessão (refresh de 30 s do usuário) e hook
// depois de `return` antecipado quebra a tela — por isso o conteúdo vive em componente próprio.
export default function TarefasPage() {
  const allowed = usePageAccess("tarefas");
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTaskId = parseTaskIdParam(searchParams.get("taskId"));
  const hasUser = useAuthStore((s) => !!s.user);
  const tenantConfigsLoaded = useAuthStore((s) => s.tenantConfigsLoaded);
  const tasksFeature = useAuthStore((s) => s.hasFeature("tasks"));
  // D23: sem acesso à página, o link de uma tarefa (push/aviso) vira o detalhe no sino —
  // guarda o id e vai para a página inicial (o mesmo destino do acesso negado no guard).
  // Só decide com o acesso já carregado: redirecionar num acesso ainda incompleto tiraria
  // da página quem tem permissão.
  // Push agrupado (várias tarefas) chega como `?from=reminder`: sem acesso, abre a lista do sino.
  const fromReminder = searchParams.get("from") === "reminder";
  const sendToBellDetail =
    !allowed && hasUser && tenantConfigsLoaded && tasksFeature && (requestedTaskId !== null || fromReminder);
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (!sendToBellDetail || redirectedRef.current) return;
    redirectedRef.current = true;
    try {
      if (requestedTaskId !== null) sessionStorage.setItem(OPEN_TASK_DETAIL_STORAGE_KEY, String(requestedTaskId));
      else sessionStorage.setItem(OPEN_TASK_LIST_STORAGE_KEY, "1");
    } catch { /* sem sessionStorage: só sai da página */ }
    router.replace("/");
  }, [sendToBellDetail, requestedTaskId, router]);

  if (!allowed) return sendToBellDetail ? null : <AccessDenied />;
  return <TarefasPageContent />;
}

function TarefasPageContent() {
  const t = useTranslations("tarefasPage");
  const tTask = useTranslations("taskShared");
  const tErrors = useTranslations("errors");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskIdParam = searchParams.get("taskId");
  const isRestricted = useAuthStore((s) => s.isRestrictedUser());
  const timeSupported = useTaskSummaryStore((s) => s.timeSupported === true);

  const { user, hasPermission } = useAuthStore();
  // Excluir tarefa: admin como sempre, e perfil custom quando tem tasks_delete
  // (o backend em TodoListControllerZPRO já permitia — só o front escondia o botão).
  const isAdmin =
    user?.profile === "admin" ||
    (user?.profile === "custom" && hasPermission("tasks_delete"));
  // Mesmo critério do backend (isAdminLike com tasks_view_all) para o aviso da D32.
  const currentUserId = user?.userId;
  const seesAllTasks =
    user?.profile === "admin" ||
    user?.profile === "superadmin" ||
    user?.profile === "super" ||
    (user?.profile === "custom" && hasPermission("tasks_view_all"));

  const statusMap: Record<string, { label: string; variant: "secondary" | "default" | "destructive" | "outline" | "warning" }> = {
    pending: { label: t("statusPending"), variant: STATUS_VARIANT_MAP.pending },
    delayed: { label: t("statusDelayed"), variant: STATUS_VARIANT_MAP.delayed },
    finished: { label: t("statusFinished"), variant: STATUS_VARIANT_MAP.finished },
  };

  const priorityMap: Record<string, { label: string; variant: "secondary" | "default" | "destructive" | "outline" | "warning" }> = {
    none: { label: t("priorityNone"), variant: PRIORITY_VARIANT_MAP.none },
    low: { label: t("priorityLow"), variant: PRIORITY_VARIANT_MAP.low },
    medium: { label: t("priorityMedium"), variant: PRIORITY_VARIANT_MAP.medium },
    high: { label: t("priorityHigh"), variant: PRIORITY_VARIANT_MAP.high },
  };

  const [activeTab, setActiveTab] = useState("list");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TodoItem[]>([]);
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<User[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TodoItem | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formComments, setFormComments] = useState("");
  const [formStatus, setFormStatus] = useState("pending");
  const [formPriority, setFormPriority] = useState("medium");
  const [formDeadline, setFormDeadline] = useState<TaskDeadlineValue>(EMPTY_DEADLINE);
  const [deadlineError, setDeadlineError] = useState(false);
  // Prazo como abriu na edição: sem mudança, o PUT (parcial) não reenvia o prazo.
  const initialDeadlineRef = useRef<TaskDeadlineValue>(EMPTY_DEADLINE);
  // Contato (D13): opcional; "Nenhum" = tarefa solta. Usuário restrito não vê o campo.
  const [formContact, setFormContact] = useState<ContactPickerValue | null>(null);
  const initialContactIdRef = useRef<number | null>(null);
  const [formOwnerId, setFormOwnerId] = useState("");
  const [formRecurrence, setFormRecurrence] = useState("1");
  const [formRecurrenceTimes, setFormRecurrenceTimes] = useState("");;
  const [formWeekDays, setFormWeekDays] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Kanban DnD state ──
  const dragTask = useRef<TodoItem | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const KANBAN_COLS: KanbanColDef[] = [
    {
      id: "pending",
      label: t("statusPending"),
      dotColor: "bg-yellow-400",
      headerClass: "bg-yellow-50 dark:bg-yellow-900/20 border border-b-0 border-yellow-200 dark:border-yellow-800",
      dropClass: "border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-900/10",
    },
    {
      id: "delayed",
      label: t("statusDelayed"),
      dotColor: "bg-red-500",
      headerClass: "bg-red-50 dark:bg-red-900/20 border border-b-0 border-red-200 dark:border-red-800",
      dropClass: "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10",
    },
    {
      id: "finished",
      label: t("statusFinished"),
      dotColor: "bg-emerald-500",
      headerClass: "bg-emerald-50 dark:bg-emerald-900/20 border border-b-0 border-emerald-200 dark:border-emerald-800",
      dropClass: "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10",
    },
  ];

  const loadTasks = useCallback(async (): Promise<TodoItem[]> => {
    try {
      const { data: res } = await fetchTodoLists();
      const list: TodoItem[] = Array.isArray(res) ? res : res.todoLists || res.data || [];
      markTimeSupportedFromTasks(list);
      setData(list);
      return list;
    } catch {
      toast.error(t("errorLoading"));
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
    fetchAllUsers().then((res) => {
      const list = res.data?.users || [];
      setUsers(list.filter((u: User) => u.profile !== "superadmin"));
    }).catch(() => { toast.error(tErrors("loadFailed")); });
  }, [loadTasks]);

  const openCreateDialog = () => {
    setEditingTask(null);
    setFormName("");
    setFormDescription("");
    setFormComments("");
    setFormStatus("pending");
    setFormPriority("medium");
    setFormDeadline(EMPTY_DEADLINE);
    initialDeadlineRef.current = EMPTY_DEADLINE;
    setDeadlineError(false);
    setFormContact(null);
    initialContactIdRef.current = null;
    setFormOwnerId("");
    setFormRecurrence("1");
    setFormRecurrenceTimes("");
    setFormWeekDays([]);
    setDialogOpen(true);
  };

  const openEditDialog = (task: TodoItem) => {
    setEditingTask(task);
    setFormName(task.name || "");
    setFormDescription(task.description || "");
    setFormComments(task.comments || "");
    setFormStatus(task.status || "pending");
    setFormPriority(task.priority || "medium");
    const deadline = deadlineValueOf(task);
    setFormDeadline(deadline);
    initialDeadlineRef.current = deadline;
    setDeadlineError(false);
    const contactId = task.contact?.id ?? task.contactId ?? null;
    setFormContact(contactId ? { id: contactId, name: task.contact?.name || `#${contactId}` } : null);
    initialContactIdRef.current = contactId;
    setFormOwnerId(task.ownerId ? String(task.ownerId) : (task.userId ? String(task.userId) : ""));
    setFormRecurrence(String(task.recurrence || 1));
    setFormRecurrenceTimes(task.recurrenceTimes ? String(task.recurrenceTimes) : "");
    setFormWeekDays([]);
    setDialogOpen(true);
  };

  // Recorrência: as datas são DIAS (AAAA-MM-DD); cada cópia recebe a mesma hora local e o
  // mesmo lembrete pelo buildTaskDeadlinePayload — só o dia muda (horário de verão incluso).
  function addDays(dateStr: string, days: number): string {
    const [year, month, day] = dateStr.slice(0, 10).split("-").map(Number);
    const d = new Date(year, month - 1, day);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }

  function getWeekdayOccurrences(startDate: string, weekdays: number[], count: number): string[] {
    const dates: string[] = [];
    const [year, month, day] = startDate.slice(0, 10).split("-").map(Number);
    const cur = new Date(year, month - 1, day);
    let safety = 0;
    while (dates.length < count && safety < 730) {
      if (weekdays.includes(cur.getDay())) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, "0");
        const d = String(cur.getDate()).padStart(2, "0");
        dates.push(`${y}-${m}-${d}`);
      }
      cur.setDate(cur.getDate() + 1);
      safety++;
    }
    return dates;
  }

  const handleSave = async () => {
    if (!formName.trim()) { toast.error(t("errorNameRequired")); return; }
    if (!formDeadline.date) { setDeadlineError(true); toast.error(t("errorDeadlineRequired")); return; }
    if (!formOwnerId) { toast.error(t("errorOwnerRequired")); return; }
    if (!formStatus) { toast.error(t("errorStatusRequired")); return; }
    if (!formPriority) { toast.error(t("errorPriorityRequired")); return; }
    if (formRecurrence === "weekdays" && formWeekDays.length === 0) { toast.error(t("errorWeekdaysRequired")); return; }
    // Prazo com hora só quando o backend tem as colunas (sem elas vai só a data, como antes).
    const deadlineFor = (date: string) =>
      buildTaskDeadlinePayload({
        date,
        time: formDeadline.time,
        reminderMinutes: formDeadline.reminderMinutes,
        timeSupported,
      });
    const deadlinePayload = deadlineFor(formDeadline.date);
    if (!deadlinePayload) { setDeadlineError(true); toast.error(t("errorDeadlineRequired")); return; }
    setSaving(true);
    try {
      const ownerUser = users.find((u) => String(u.id) === formOwnerId);
      const isNoRecurrence = formRecurrence === "1";
      const isDaily = formRecurrence === "daily";
      const isWeekdays = formRecurrence === "weekdays";
      const recurrenceNum = isDaily ? 1 : isWeekdays ? 1 : (Number(formRecurrence) || 1);
      const recurrenceTimesNum = formRecurrenceTimes ? Number(formRecurrenceTimes) : undefined;
      const contactId = formContact?.id ?? null;

      const basePayload: TodoPayload = {
        name: formName,
        description: formDescription || undefined,
        comments: formComments || undefined,
        status: formStatus,
        priority: formPriority,
        owner: ownerUser?.name,
        ownerId: ownerUser?.id,
        recurrence: recurrenceNum,
        recurrenceTimes: recurrenceTimesNum,
      };

      if (editingTask) {
        const payload: Partial<TodoPayload> = { ...basePayload };
        if (!sameDeadlineValue(formDeadline, initialDeadlineRef.current)) Object.assign(payload, deadlinePayload);
        // Trocar o contato desliga o atendimento (era do contato anterior). Restrito não vê o campo.
        if (!isRestricted && contactId !== initialContactIdRef.current) {
          payload.contactId = contactId;
          payload.ticketId = null;
        }
        await updateTodoList(editingTask.id, payload);
        toast.success(t("taskUpdated"));
      } else {
        const createBase: TodoPayload = { ...basePayload, ...(!isRestricted && contactId ? { contactId } : {}) };
        if (isNoRecurrence) {
          await createTodoList({ ...createBase, ...deadlinePayload });
        } else if (isWeekdays) {
          const qty = recurrenceTimesNum || 5;
          const dates = getWeekdayOccurrences(formDeadline.date, formWeekDays, qty);
          for (const date of dates) {
            const copyDeadline = deadlineFor(date);
            if (copyDeadline) await createTodoList({ ...createBase, ...copyDeadline });
          }
        } else {
          const qty = recurrenceTimesNum || 5;
          for (let i = 0; i < qty; i++) {
            const copyDeadline = deadlineFor(addDays(formDeadline.date, i * recurrenceNum));
            if (copyDeadline) await createTodoList({ ...createBase, ...copyDeadline });
          }
        }
        // D32: quem não vê todas as tarefas não verá a criada para um colega na própria lista.
        if (!seesAllTasks && ownerUser && String(ownerUser.id) !== String(currentUserId)) {
          toast.success(tTask("createdForOther", { name: ownerUser.name }));
        } else {
          toast.success(t("taskCreated"));
        }
      }
      setDialogOpen(false);
      await loadTasks();
    } catch (err) {
      const errorKey = TODO_ERROR_KEYS[getBackendErrorCode(err)];
      if (errorKey) toast.error(tTask(errorKey));
      else toast.error(editingTask ? t("errorUpdating") : t("errorCreating"));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleFinished = async (task: TodoItem) => {
    const newStatus = task.status === "finished" ? "pending" : "finished";
    try {
      await updateTodoList(task.id, { status: newStatus });
      setData((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)));
    } catch {
      toast.error(t("errorUpdatingStatus"));
    }
  };

  const handleDelete = async () => {
    if (deleteId == null) return;
    setDeleting(true);
    try {
      await deleteTodoList(deleteId);
      setData((prev) => prev.filter((item) => item.id !== deleteId));
      toast.success(t("taskDeleted"));
    } catch {
      toast.error(t("errorDeleting"));
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  // ── Kanban DnD handlers ──
  // "Atrasada" é calculada pelo prazo: soltar em "Pendente" não tira do atraso (é preciso
  // reagendar). Sem este aviso o card voltava para a coluna sem nenhuma explicação.
  const hintOverdueDrop = (task: TodoItem, target: string) => {
    if (target === "pending" && taskDeadlineState({ ...task, status: "pending" }) === "overdue") {
      toast.info(t("dropOverdueHint"));
    }
  };

  // Touch: segurar o card ~300 ms; antes disso o dedo rola a pagina
  const { touchStart: kanbanTouchStart } = useTouchDrag<TodoItem>({
    dataAttr: "data-col-id",
    onDrop: (task, colId) => {
      hintOverdueDrop(task, colId);
      // Coluna = estado calculado; status gravado igual ao destino = nada muda no servidor.
      if (displayStatusOf(task) === colId || task.status === colId) return;
      const prevData = data;
      setData((prev) => prev.map((item) => (item.id === task.id ? { ...item, status: colId } : item)));
      // D10d: só o status (o PUT é parcial) — reenviar o prazo apagaria a hora.
      updateTodoList(task.id, { status: colId }).catch(() => {
        setData(prevData);
        toast.error(t("errorUpdatingStatus"));
      });
    },
  });

  const handleKanbanDragStart = (task: TodoItem) => {
    dragTask.current = task;
  };

  const handleKanbanDragEnd = () => {
    dragTask.current = null;
    setDragOverCol(null);
  };

  const handleKanbanDrop = async (targetStatus: string) => {
    const task = dragTask.current;
    setDragOverCol(null);
    dragTask.current = null;
    if (task) hintOverdueDrop(task, targetStatus);
    if (!task || displayStatusOf(task) === targetStatus || task.status === targetStatus) return;
    const prevData = data;
    setData((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: targetStatus } : t)));
    try {
      // D10d: só o status (o PUT é parcial) — reenviar o prazo apagaria a hora.
      await updateTodoList(task.id, { status: targetStatus });
      toast.success(t("kanbanMovedStatus"));
    } catch {
      setData(prevData);
      toast.error(t("errorUpdatingStatus"));
    }
  };

  const filtered = data.filter((task) =>
    (task.name || "").toLowerCase().includes(search.toLowerCase())
  );
  // Ordenação das colunas Prazo e Status pelo prazo calculado (atrasadas → hoje → futuras),
  // não pelo texto do valor gravado (dia inteiro e com hora não se comparam como texto).
  const deadlineRank = new Map<number, number>(
    sortTasksByDeadline(filtered).map((task, index): [number, number] => [task.id, index]),
  );
  const sortable = filtered.map((task) => ({
    ...task,
    deadlineRank: deadlineRank.get(task.id) ?? Number.MAX_SAFE_INTEGER,
    displayStatus: displayStatusOf(task),
  }));
  const { sortKey, sortDir, handleSort, sortedData } = useSortable(sortable, "name");

  const tasksByStatus = (status: string) =>
    data.filter((task) => displayStatusOf(task) === status);

  // D16: `?taskId=` (aviso, push, card do atendimento) abre a edição da tarefa e limpa a URL.
  const dataRef = useRef<TodoItem[]>(data);
  dataRef.current = data;
  const handledTaskParamRef = useRef<string | null>(null);
  useEffect(() => {
    if (!taskIdParam) {
      handledTaskParamRef.current = null;
      return;
    }
    if (loading || handledTaskParamRef.current === taskIdParam) return;
    handledTaskParamRef.current = taskIdParam;
    const taskId = parseTaskIdParam(taskIdParam);
    const finish = (task: TodoItem | undefined) => {
      if (task) openEditDialog(task);
      else toast.error(t("taskNotFound"));
      router.replace("/tarefas", { scroll: false });
    };
    if (taskId === null) {
      finish(undefined);
      return;
    }
    // `TodoLists.id` é BIGINT: a API devolve o id como texto ("29").
    const known = dataRef.current.find((task) => Number(task.id) === taskId);
    if (known) {
      finish(known);
      return;
    }
    // Tarefa criada depois da carga da página: recarrega uma vez antes de desistir.
    loadTasks().then((list) => finish(list.find((task) => Number(task.id) === taskId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskIdParam, loading]);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} help={{
        description: t("helpDesc"),
        sections: [
          { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
          { title: t("helpS1T"), items: [t("helpS1I0"), tCommon("touchDragHint"), t("helpS1I1")] },
        ],
      }}>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" /> {t("newTask")}
        </Button>
      </PageHeader>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-[400px]" />
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-2">
            <TabsTrigger value="list" className="gap-1.5">
              <LayoutList className="h-4 w-4" />
              {t("tabList")}
            </TabsTrigger>
            <TabsTrigger value="kanban" className="gap-1.5">
              <KanbanIcon className="h-4 w-4" />
              {t("tabKanban")}
            </TabsTrigger>
          </TabsList>

          {/* ── Lista ── */}
          <TabsContent value="list" className="space-y-4 mt-0">
            <div className="flex items-center gap-2">
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t("searchPlaceholder")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {filtered.length === 0 ? (
              <EmptyState icon={CheckSquare} title={t("emptyTitle")} description={t("emptyDescription")}>
                <Button onClick={openCreateDialog}>
                  <Plus className="mr-2 h-4 w-4" /> {t("newTask")}
                </Button>
              </EmptyState>
            ) : (
              <Card>
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]" />
                        <SortableTableHead sortKey="name" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colTask")}</SortableTableHead>
                        <SortableTableHead sortKey="priority" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colPriority")}</SortableTableHead>
                        <SortableTableHead sortKey="deadlineRank" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colDeadline")}</SortableTableHead>
                        <SortableTableHead sortKey="displayStatus" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colStatus")}</SortableTableHead>
                        <SortableTableHead sortKey="owner" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort}>{t("colOwner")}</SortableTableHead>
                        <TableHead className="w-[100px]">{t("colActions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedData.map((task) => {
                        const st = statusMap[task.displayStatus] || { label: task.status, variant: "secondary" as const };
                        const pr = priorityMap[task.priority || "medium"] || { label: task.priority, variant: "secondary" as const };
                        return (
                          <TableRow key={task.id} className={task.status === "finished" ? "opacity-60" : ""}>
                            <TableCell>
                              <Checkbox
                                checked={task.status === "finished"}
                                onCheckedChange={() => handleToggleFinished(task)}
                              />
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className={`font-medium ${task.status === "finished" ? "line-through" : ""}`}>
                                  {task.name}
                                </p>
                                {task.description && (
                                  <p className="text-xs text-muted-foreground line-clamp-1">{task.description}</p>
                                )}
                                <TaskContactChip contact={task.contact} className="mt-1" />
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={pr.variant as "secondary"}>{pr.label}</Badge>
                            </TableCell>
                            <TableCell className={cn("whitespace-nowrap", deadlineTextClass(task))}>
                              {formatTaskDeadline(task) ?? "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant={st.variant as "secondary"}>{st.label}</Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {task.owner || task.user?.name || "—"}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="sm" onClick={() => openEditDialog(task)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                {isAdmin && (
                                  <Button variant="ghost" size="sm" onClick={() => setDeleteId(task.id)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Kanban ── */}
          <TabsContent value="kanban" className="mt-0">
            {data.length === 0 ? (
              <EmptyState icon={KanbanIcon} title={t("emptyTitle")} description={t("emptyDescription")}>
                <Button onClick={openCreateDialog}>
                  <Plus className="mr-2 h-4 w-4" /> {t("newTask")}
                </Button>
              </EmptyState>
            ) : (
              <div className="flex gap-4 overflow-x-auto pb-4">
                {KANBAN_COLS.map((col) => (
                  <KanbanColumn
                    key={col.id}
                    col={col}
                    tasks={tasksByStatus(col.id)}
                    isOver={dragOverCol === col.id}
                    onDragEnter={() => setDragOverCol(col.id)}
                    onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.id); }}
                    onDragLeave={() => setDragOverCol(null)}
                    onDrop={() => handleKanbanDrop(col.id)}
                    priorityMap={priorityMap}
                    onDragStart={handleKanbanDragStart}
                    onDragEnd={handleKanbanDragEnd}
                    onEdit={openEditDialog}
                    onDelete={(id) => setDeleteId(id)}
                    onToggleFinished={handleToggleFinished}
                    isAdmin={isAdmin}
                    t={t}
                    onTouchStart={kanbanTouchStart}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* ── Create/Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTask ? t("dialogEditTitle") : t("dialogCreateTitle")}</DialogTitle>
            <DialogDescription>
              {editingTask ? t("dialogEditDescription") : t("dialogCreateDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label>{t("labelName")} *</Label>
              <Input
                placeholder={t("namePlaceholder")}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("labelDescription")}</Label>
              <Textarea
                placeholder={t("descriptionPlaceholder")}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("labelComments")}</Label>
              <Textarea
                placeholder={t("commentsPlaceholder")}
                value={formComments}
                onChange={(e) => setFormComments(e.target.value)}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("labelPriority")} *</Label>
                <Select value={formPriority} onValueChange={setFormPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("priorityNone")}</SelectItem>
                    <SelectItem value="low">{t("priorityLow")}</SelectItem>
                    <SelectItem value="medium">{t("priorityMedium")}</SelectItem>
                    <SelectItem value="high">{t("priorityHigh")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("labelStatus")} *</Label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">{t("statusPending")}</SelectItem>
                    <SelectItem value="delayed">{t("statusDelayed")}</SelectItem>
                    <SelectItem value="finished">{t("statusFinished")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <TaskDeadlineFields
              idPrefix="task-form-deadline"
              value={formDeadline}
              onChange={(next) => {
                setFormDeadline(next);
                if (next.date) setDeadlineError(false);
              }}
              showDateError={deadlineError}
            />
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label>{t("labelRecurrence")}</Label>
                <Select value={formRecurrence} onValueChange={setFormRecurrence}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t("recurrenceNone")}</SelectItem>
                    <SelectItem value="daily">{t("recurrenceDaily")}</SelectItem>
                    <SelectItem value="weekdays">{t("recurrenceWeekdays")}</SelectItem>
                    <SelectItem value="7">{t("recurrenceWeekly")}</SelectItem>
                    <SelectItem value="30">{t("recurrenceMonthly")}</SelectItem>
                    <SelectItem value="45">{t("recurrence45")}</SelectItem>
                    <SelectItem value="60">{t("recurrenceBimonthly")}</SelectItem>
                    <SelectItem value="75">{t("recurrence75")}</SelectItem>
                    <SelectItem value="90">{t("recurrenceQuarterly")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {formRecurrence === "weekdays" && (
              <div className="space-y-2">
                <Label>{t("labelWeekdays")}</Label>
                <div className="flex flex-wrap gap-2">
                  {([t("weekdaySun"), t("weekdayMon"), t("weekdayTue"), t("weekdayWed"), t("weekdayThu"), t("weekdayFri"), t("weekdaySat")] as string[]).map((day, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setFormWeekDays(prev => prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i])}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-sm font-medium border transition-colors",
                        formWeekDays.includes(i)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!editingTask && formRecurrence !== "1" && (
              <div className="space-y-2">
                <Label>{t("labelRecurrenceTimes")}</Label>
                <Input
                  type="number"
                  min="1"
                  placeholder={t("recurrenceTimesPlaceholder")}
                  value={formRecurrenceTimes}
                  onChange={(e) => setFormRecurrenceTimes(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>{t("labelOwner")} *</Label>
              <SearchableSelect
                options={users.map((u) => ({ value: String(u.id), label: u.name }))}
                value={formOwnerId}
                onValueChange={setFormOwnerId}
                placeholder={t("ownerPlaceholder")}
              />
            </div>
            {!isRestricted && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="task-form-contact">{t("labelContact")}</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          aria-label={t("labelContact")}
                        >
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        {t("contactTooltip")}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <ContactPicker id="task-form-contact" value={formContact} onChange={setFormContact} disabled={saving} />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            {editingTask?.ticketId ? (
              <Button variant="outline" className="sm:mr-auto" asChild>
                <Link href={`/atendimento?ticketId=${editingTask.ticketId}`}>
                  <MessageSquare className="mr-2 h-4 w-4" /> {tTask("openTicket")}
                </Link>
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>{t("cancel")}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ── */}
      <Dialog open={deleteId != null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={deleting}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? t("deleting") : t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
