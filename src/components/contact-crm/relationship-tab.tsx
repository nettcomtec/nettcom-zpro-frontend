"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, Download, Handshake, ListTodo, Loader2, Paperclip,
  Pencil, Plus, RotateCcw, RotateCw, Settings2, ShieldOff, Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/layout/empty-state";
import {
  RelationshipFormDialog, formatFileSize, relationshipErrorCode, relationshipErrorCodeAsync,
  relationshipErrorMessage, safeTypeColor,
} from "@/components/contact-crm/relationship-form-dialog";
import { useLiveMode } from "@/hooks/use-live-mode";
import { isFeatureNotInPlanError } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  deleteRelationship, downloadRelationshipAttachment, fetchRelationshipTypes, fetchRelationships,
  type RelationshipAttachmentInfo, type RelationshipItem, type RelationshipType,
} from "@/services/relationship";
import { createTodoList, fetchTodoLists, updateTodoList, type TodoItem } from "@/services/tasks";
import { useAuthStore } from "@/stores/auth-store";

// PLANO_CRM_CONTATO — Fase 3 (§5.3-11). Aba Relacionamento da página /contatos/[contactId].
// Quem edita/exclui vem do backend (`canEdit` por registro, `canManage` na listagem — D23/D26):
// o front nunca decide isso por `hasPermission`.

const PAGE_SIZE = 20;
const LONG_NOTES_CHARS = 240;
const LONG_NOTES_LINES = 4;

type ViewStatus = "loading" | "ok" | "error" | "noAccess";

function sortRecords(list: RelationshipItem[]): RelationshipItem[] {
  return [...list].sort((a, b) => {
    const ta = Date.parse(a.occurredAt) || 0;
    const tb = Date.parse(b.occurredAt) || 0;
    if (tb !== ta) return tb - ta;
    return b.id - a.id;
  });
}

/** Acrescenta sem repetir `id` (páginas vizinhas podem se sobrepor). */
function mergeRecords(current: RelationshipItem[], incoming: RelationshipItem[] | null | undefined): RelationshipItem[] {
  if (!Array.isArray(incoming) || incoming.length === 0) return current;
  const seen = new Set(current.map((item) => item.id));
  const next = [...current];
  for (const item of incoming) {
    if (!item || typeof item.id !== "number" || seen.has(item.id)) continue;
    seen.add(item.id);
    next.push(item);
  }
  return sortRecords(next);
}

function errorStatus(err: unknown): number | undefined {
  const e = err as { status?: number; response?: { status?: number } } | null;
  return e?.status ?? e?.response?.status;
}

export interface RelationshipTabProps {
  contactId: number;
  /** Dica do ticket de origem — repassada ao backend e gravada no registro novo */
  ticketId?: number | null;
}

export function RelationshipTab({ contactId, ticketId }: RelationshipTabProps) {
  const t = useTranslations("relationship");
  const { isLiveMode } = useLiveMode();
  const blur = isLiveMode;
  // Seletor com o resultado: a aba reage quando o plano do tenant é recarregado.
  const tasksEnabled = useAuthStore((s) => s.hasFeature("tasks"));

  const [status, setStatus] = useState<ViewStatus>("loading");
  const [types, setTypes] = useState<RelationshipType[]>([]);
  const [items, setItems] = useState<RelationshipItem[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RelationshipItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RelationshipItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(() => new Set());
  const [downloading, setDownloading] = useState<Set<string>>(() => new Set());

  // Toda carga do zero avança a sequência: resposta anterior (inclusive "carregar mais") é descartada.
  const requestSeq = useRef(0);
  const loadingMoreRef = useRef(false);
  const downloadingRef = useRef<Set<string>>(new Set());

  const hintTicketId = ticketId ?? null;

  useEffect(() => {
    const seq = ++requestSeq.current;
    loadingMoreRef.current = false;
    setStatus("loading");
    setItems([]);
    setNextCursor(null);
    setLoadingMore(false);
    setLoadMoreFailed(false);

    Promise.all([
      fetchRelationshipTypes({ background: true }),
      fetchRelationships(contactId, { ticketId: hintTicketId, limit: PAGE_SIZE, background: true }),
    ])
      .then(([typesRes, listRes]) => {
        if (seq !== requestSeq.current) return;
        const activeTypes = (Array.isArray(typesRes.data) ? typesRes.data : [])
          .filter((type) => type && type.isActive !== false)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(String(b.name)));
        setTypes(activeTypes);
        setItems(mergeRecords([], listRes.data?.items));
        setNextCursor(listRes.data?.nextCursor || null);
        setCanManage(listRes.data?.canManage === true);
        setStatus("ok");
      })
      .catch((err) => {
        if (seq !== requestSeq.current) return;
        setStatus(relationshipErrorCode(err) === "ERR_CONTACT_CRM_NO_ACCESS" ? "noAccess" : "error");
      });

    return () => {
      requestSeq.current += 1;
    };
  }, [contactId, hintTicketId, reloadKey]);

  const handleLoadMore = useCallback(() => {
    if (!nextCursor || loadingMoreRef.current) return;
    const seq = requestSeq.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreFailed(false);

    fetchRelationships(contactId, { cursor: nextCursor, limit: PAGE_SIZE, ticketId: hintTicketId })
      .then(({ data }) => {
        if (seq !== requestSeq.current) return;
        setItems((prev) => mergeRecords(prev, data?.items));
        setNextCursor(data?.nextCursor || null);
        if (typeof data?.canManage === "boolean") setCanManage(data.canManage);
      })
      .catch(() => {
        if (seq === requestSeq.current) setLoadMoreFailed(true);
      })
      .finally(() => {
        if (seq !== requestSeq.current) return;
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [contactId, hintTicketId, nextCursor]);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (item: RelationshipItem) => {
    setEditing(item);
    setDialogOpen(true);
  };

  const handleSaved = (saved: RelationshipItem) => {
    const wasEdit = !!editing;
    if (saved && typeof saved.id === "number") {
      setItems((prev) => sortRecords([...prev.filter((item) => item.id !== saved.id), saved]));
    } else {
      setReloadKey((k) => k + 1);
    }
    toast.success(wasEdit ? t("updated") : t("created"));
  };

  const confirmDelete = async () => {
    const target = deleteTarget;
    if (!target || deleting) return;
    setDeleting(true);
    try {
      await deleteRelationship(target.id, hintTicketId);
      setItems((prev) => prev.filter((item) => item.id !== target.id));
      toast.success(t("deleted"));
      setDeleteTarget(null);
    } catch (err) {
      if (!isFeatureNotInPlanError(err)) toast.error(relationshipErrorMessage(t, relationshipErrorCode(err)));
    } finally {
      setDeleting(false);
    }
  };

  const handleDownload = async (item: RelationshipItem, att: RelationshipAttachmentInfo) => {
    const key = `${item.id}:${att.index}`;
    if (downloadingRef.current.has(key)) return;
    downloadingRef.current.add(key);
    setDownloading(new Set(downloadingRef.current));
    try {
      const { data } = await downloadRelationshipAttachment(item.id, att.index, hintTicketId);
      const blob = data instanceof Blob ? data : new Blob([data as BlobPart]);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = att.name || "file";
      anchor.rel = "noopener";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Alguns navegadores só começam a baixar depois do clique: revogar no próximo ciclo.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      // Corpo em Blob: o 402 de plano só se reconhece depois de ler o código (o aviso global já saiu).
      const code = await relationshipErrorCodeAsync(err);
      if (!isFeatureNotInPlanError(err) && code !== "ERR_FEATURE_NOT_IN_PLAN") {
        toast.error(relationshipErrorMessage(t, code, "loadError"));
      }
    } finally {
      downloadingRef.current.delete(key);
      setDownloading(new Set(downloadingRef.current));
    }
  };

  const toggleNotes = (id: number) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const noTypes = types.length === 0;

  const manageTypesLink = canManage ? (
    <Button asChild variant="outline" size="sm">
      <Link href="/configuracoes/relacionamento">
        <Settings2 />
        {t("manageTypes")}
      </Link>
    </Button>
  ) : null;

  const renderRecord = (item: RelationshipItem) => {
    const color = safeTypeColor(item.type?.color);
    const notes = (item.notes || "").trim();
    const longNotes = notes.length > LONG_NOTES_CHARS || notes.split("\n").length > LONG_NOTES_LINES;
    const notesExpanded = expandedNotes.has(item.id);
    const attachments = Array.isArray(item.attachments) ? item.attachments : [];
    const occurred = new Date(item.occurredAt);
    const meta: string[] = [];
    if (item.user) meta.push(t("responsible", { name: item.user.name || `#${item.user.id}` }));
    if (item.createdBy) meta.push(t("byUser", { name: item.createdBy.name || `#${item.createdBy.id}` }));
    if (item.ticketId) meta.push(t("ticketLabel", { id: String(item.ticketId) }));

    return (
      <Card key={item.id}>
        <CardContent className="space-y-2 p-3 sm:p-4">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium">
                  <span
                    aria-hidden
                    className={cn("h-2.5 w-2.5 shrink-0 rounded-full", !color && "bg-muted-foreground/40")}
                    style={color ? { backgroundColor: color } : undefined}
                  />
                  <span className="break-words">{item.type?.name || "—"}</span>
                </span>
                {item.type && item.type.isActive === false && (
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
                    {t("inactiveType")}
                  </Badge>
                )}
              </div>
              {!Number.isNaN(occurred.getTime()) && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDateTime(occurred, { dateStyle: "short", timeStyle: "short" })}
                </p>
              )}
            </div>
            {item.canEdit && (
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => openEdit(item)}
                  aria-label={t("edit")}
                  title={t("edit")}
                >
                  <Pencil />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(item)}
                  aria-label={t("delete")}
                  title={t("delete")}
                >
                  <Trash2 />
                </Button>
              </div>
            )}
          </div>

          {item.description && (
            <p className={cn("whitespace-pre-wrap break-words text-sm", blur && "live-blur-text")}>
              {item.description}
            </p>
          )}

          {notes && (
            <div className="rounded-md bg-muted/50 px-2.5 py-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">{t("fieldNotes")}</p>
                {longNotes && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => toggleNotes(item.id)}
                    aria-expanded={notesExpanded}
                    aria-label={t("fieldNotes")}
                  >
                    <ChevronDown className={cn("transition-transform", notesExpanded && "rotate-180")} />
                  </Button>
                )}
              </div>
              <p
                className={cn(
                  "whitespace-pre-wrap break-words text-sm text-foreground",
                  longNotes && !notesExpanded && "line-clamp-4",
                  blur && "live-blur-text"
                )}
              >
                {notes}
              </p>
            </div>
          )}

          {attachments.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {attachments.map((att) => {
                const busy = downloading.has(`${item.id}:${att.index}`);
                return (
                  <li key={att.index} className="max-w-full">
                    <button
                      type="button"
                      onClick={() => handleDownload(item, att)}
                      disabled={busy}
                      title={t("download")}
                      aria-label={`${t("download")}: ${att.name}`}
                      className={cn(
                        "inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors",
                        "hover:bg-accent hover:text-accent-foreground disabled:opacity-60",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      )}
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                      ) : (
                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className={cn("min-w-0 max-w-[12rem] truncate", blur && "live-blur-text")}>
                        {att.name}
                      </span>
                      <span className="shrink-0 text-muted-foreground">{formatFileSize(att.size)}</span>
                      <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {meta.length > 0 && <p className="break-words text-xs text-muted-foreground">{meta.join(" · ")}</p>}
        </CardContent>
      </Card>
    );
  };

  let body: ReactNode;
  if (status === "loading") {
    body = (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-2 p-4">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  } else if (status === "noAccess") {
    body = <EmptyState icon={ShieldOff} title={t("errNoAccess")} />;
  } else if (status === "error") {
    body = (
      <EmptyState icon={AlertTriangle} title={t("loadError")}>
        <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
          <RotateCw className="mr-2 h-4 w-4" />
          {t("retry")}
        </Button>
      </EmptyState>
    );
  } else if (items.length === 0) {
    body = noTypes ? (
      <EmptyState icon={Handshake} title={t("noTypes")} description={t("noTypesHint")}>
        {manageTypesLink}
      </EmptyState>
    ) : (
      <EmptyState icon={Handshake} title={t("empty")} description={t("emptyHint")}>
        <Button size="sm" onClick={openNew}>
          <Plus />
          {t("newRecord")}
        </Button>
      </EmptyState>
    );
  } else {
    body = (
      <div className="space-y-3">
        {noTypes && (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">{t("noTypes")}</p>
              <p className="text-xs text-muted-foreground">{t("noTypesHint")}</p>
            </div>
            {manageTypesLink && <div className="shrink-0">{manageTypesLink}</div>}
          </div>
        )}
        {items.map(renderRecord)}
        {nextCursor && (
          <div className="flex flex-col items-center gap-2">
            {loadMoreFailed && <p className="text-xs text-destructive">{t("loadError")}</p>}
            <Button variant="outline" size="sm" onClick={handleLoadMore} loading={loadingMore}>
              {!loadingMore && loadMoreFailed && <RotateCw className="h-4 w-4" />}
              {loadMoreFailed ? t("retry") : t("loadMore")}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        {status === "ok" && !noTypes && items.length > 0 && (
          <div className="flex justify-end">
            <Button size="sm" onClick={openNew}>
              <Plus />
              {t("newRecord")}
            </Button>
          </div>
        )}
        {body}
      </section>

      {tasksEnabled && <RelationshipTasks contactId={contactId} ticketId={hintTicketId} />}

      <RelationshipFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contactId={contactId}
        ticketId={hintTicketId}
        types={types}
        record={editing}
        onSaved={handleSaved}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting && <Loader2 className="animate-spin" />}
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tarefas vinculadas ao contato (D19) — só com a capacidade `tasks` no plano.
// ---------------------------------------------------------------------------

type TaskState = "pending" | "overdue" | "done";

function extractTodoList(res: unknown): unknown[] {
  if (Array.isArray(res)) return res;
  const r = res as { todoLists?: unknown; data?: unknown } | null;
  if (Array.isArray(r?.todoLists)) return r.todoLists as unknown[];
  if (Array.isArray(r?.data)) return r.data as unknown[];
  return [];
}

function hasContactLink(item: unknown): boolean {
  return !!item && typeof item === "object" && Object.prototype.hasOwnProperty.call(item, "contactId");
}

function taskStateOf(task: TodoItem, now: number): TaskState {
  if (task.status === "finished") return "done";
  if (task.status === "delayed") return "overdue";
  const deadline = task.limitDate || task.dueDate;
  if (deadline) {
    const time = Date.parse(deadline);
    if (Number.isFinite(time) && time < now) return "overdue";
  }
  return "pending";
}

/** Prazo é data pura (mesma leitura da tela de tarefas): nunca escorrega um dia pelo fuso. */
function deadlineParts(value?: string | null): string | null {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function formatDeadline(value?: string | null): string | null {
  const day = deadlineParts(value);
  if (!day) return null;
  const [year, month, date] = day.split("-").map(Number);
  return formatDate(new Date(year, month - 1, date));
}

function todayInputValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sortTasks(list: TodoItem[]): TodoItem[] {
  const deadline = (task: TodoItem) => {
    const time = Date.parse(task.limitDate || task.dueDate || "");
    return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
  };
  return [...list].sort((a, b) => {
    const aDone = a.status === "finished" ? 1 : 0;
    const bDone = b.status === "finished" ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    if (aDone === 1) return (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0);
    return deadline(a) - deadline(b) || a.id - b.id;
  });
}

const TASK_BADGE: Record<TaskState, "warning-soft" | "destructive-soft" | "success-soft"> = {
  pending: "warning-soft",
  overdue: "destructive-soft",
  done: "success-soft",
};

function RelationshipTasks({ contactId, ticketId }: { contactId: number; ticketId: number | null }) {
  const t = useTranslations("relationship");
  const { isLiveMode } = useLiveMode();
  const blur = isLiveMode;
  const currentUser = useAuthStore((s) => s.user);

  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [tasks, setTasks] = useState<TodoItem[]>([]);
  // Backend sem os vínculos de tarefa (D19): a seção some em vez de mostrar tarefas de outros contatos.
  const [unsupported, setUnsupported] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const linksSeenRef = useRef(false);
  const requestSeq = useRef(0);

  const [formOpen, setFormOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formAttempted, setFormAttempted] = useState(false);
  const [creating, setCreating] = useState(false);

  const [busyId, setBusyId] = useState<number | null>(null);
  const [rescheduleId, setRescheduleId] = useState<number | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");

  const load = useCallback(
    (silent: boolean) => {
      const seq = ++requestSeq.current;
      if (!silent) setStatus("loading");
      return fetchTodoLists({ contactId })
        .then(({ data }) => {
          if (seq !== requestSeq.current) return;
          const raw = extractTodoList(data);
          if (raw.some(hasContactLink)) linksSeenRef.current = true;
          const linked = raw.filter(
            (item): item is TodoItem =>
              hasContactLink(item) &&
              (item as TodoItem).contactId != null &&
              Number((item as TodoItem).contactId) === contactId
          );
          setTasks(sortTasks(linked));
          setStatus("ok");
        })
        .catch(() => {
          if (seq === requestSeq.current && !silent) setStatus("error");
        });
    },
    [contactId]
  );

  useEffect(() => {
    void load(false);
    return () => {
      requestSeq.current += 1;
    };
  }, [load, reloadKey]);

  const resetForm = () => {
    setFormName("");
    setFormDate("");
    setFormDescription("");
    setFormAttempted(false);
  };

  const handleCreate = async () => {
    setFormAttempted(true);
    if (!formName.trim() || !deadlineParts(formDate)) {
      toast.error(t("required"));
      return;
    }
    if (!currentUser?.userId) {
      toast.error(t("taskError"));
      return;
    }
    setCreating(true);
    try {
      const { data } = await createTodoList({
        name: formName.trim(),
        description: formDescription.trim() || undefined,
        limitDate: formDate,
        contactId,
        // Mesmo vínculo do registro criado pela aba; também serve de dica de acesso ao contato.
        ...(ticketId ? { ticketId } : {}),
        ownerId: Number(currentUser.userId),
        owner: currentUser.username || String(currentUser.userId),
        status: "pending",
        priority: "none",
      });
      toast.success(t("taskCreated"));
      if (!hasContactLink(data) || Number((data as TodoItem).contactId) !== contactId) {
        // A tarefa foi criada, mas sem o vínculo: só aparece em /tarefas.
        setUnsupported(true);
        return;
      }
      resetForm();
      setFormOpen(false);
      await load(true);
    } catch (err) {
      // Só recusa "de contrato" esconde a seção: rede, 5xx, sessão, plano e permissão não.
      const httpStatus = errorStatus(err);
      const contractRejection =
        httpStatus != null && httpStatus >= 400 && httpStatus < 500 && ![401, 402, 403, 429].includes(httpStatus);
      if (!linksSeenRef.current && contractRejection) {
        setUnsupported(true);
      }
      if (!isFeatureNotInPlanError(err)) toast.error(t("taskError"));
    } finally {
      setCreating(false);
    }
  };

  const applyUpdate = async (task: TodoItem, changes: { status?: string; limitDate?: string }) => {
    if (busyId != null) return false;
    setBusyId(task.id);
    try {
      const { data } = await updateTodoList(task.id, changes);
      const updated = data && typeof data === "object" ? (data as TodoItem) : null;
      setTasks((prev) =>
        sortTasks(
          prev.map((item) =>
            item.id === task.id ? { ...item, ...changes, ...(updated && updated.id === task.id ? updated : {}) } : item
          )
        )
      );
      toast.success(t("taskUpdated"));
      return true;
    } catch (err) {
      if (!isFeatureNotInPlanError(err)) toast.error(t("taskError"));
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const startReschedule = (task: TodoItem) => {
    setRescheduleId(task.id);
    setRescheduleDate(deadlineParts(task.limitDate || task.dueDate) || todayInputValue());
  };

  const confirmReschedule = async (task: TodoItem) => {
    const day = deadlineParts(rescheduleDate);
    if (!day) {
      toast.error(t("required"));
      return;
    }
    const changes: { limitDate: string; status?: string } = { limitDate: day };
    // "Atrasada" gravada no banco não sai sozinha com prazo novo.
    if (task.status === "delayed") changes.status = "pending";
    const ok = await applyUpdate(task, changes);
    if (ok) setRescheduleId(null);
  };

  const stateLabel: Record<TaskState, string> = {
    pending: t("pending"),
    overdue: t("overdue"),
    done: t("done"),
  };

  if (unsupported) return null;

  const now = Date.now();

  let body: ReactNode;
  if (status === "loading") {
    body = (
      <Card>
        <CardContent className="space-y-3 p-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    );
  } else if (status === "error") {
    body = (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-4 text-center">
          <p className="text-sm text-muted-foreground">{t("loadError")}</p>
          <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
            <RotateCw className="mr-2 h-4 w-4" />
            {t("retry")}
          </Button>
        </CardContent>
      </Card>
    );
  } else if (tasks.length === 0) {
    body = (
      <Card>
        <CardContent className="p-4 text-center text-sm text-muted-foreground">{t("noTasks")}</CardContent>
      </Card>
    );
  } else {
    body = (
      <Card>
        <CardContent className="p-0">
          <ul className="divide-y">
            {tasks.map((task) => {
              const state = taskStateOf(task, now);
              const deadline = formatDeadline(task.limitDate || task.dueDate);
              const busy = busyId === task.id;
              const rescheduling = rescheduleId === task.id;
              return (
                <li key={task.id} className="space-y-2 p-3 sm:p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "break-words text-sm font-medium",
                            state === "done" && "text-muted-foreground line-through",
                            blur && "live-blur-text"
                          )}
                        >
                          {task.name}
                        </span>
                        <Badge variant={TASK_BADGE[state]} className="px-2 py-0 text-[11px] font-medium">
                          {stateLabel[state]}
                        </Badge>
                      </div>
                      {deadline && (
                        <p
                          className={cn(
                            "inline-flex items-center gap-1 text-xs",
                            state === "overdue" ? "text-destructive" : "text-muted-foreground"
                          )}
                        >
                          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                          {deadline}
                        </p>
                      )}
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
                      {(task.owner || task.user?.name) && (
                        <p className="break-words text-xs text-muted-foreground">
                          {t("responsible", { name: String(task.owner || task.user?.name) })}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      {state === "done" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void applyUpdate(task, { status: "pending" })}
                          loading={busy}
                          disabled={busyId != null}
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
                            onClick={() => void applyUpdate(task, { status: "finished" })}
                            loading={busy && !rescheduling}
                            disabled={busyId != null}
                          >
                            {!(busy && !rescheduling) && <CheckCircle2 />}
                            {t("complete")}
                          </Button>
                          {!rescheduling && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => startReschedule(task)}
                              disabled={busyId != null}
                            >
                              <CalendarClock />
                              {t("reschedule")}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {rescheduling && state !== "done" && (
                    <div className="flex flex-col gap-2 rounded-md bg-muted/40 p-2 sm:flex-row sm:items-center">
                      <Label htmlFor={`task-reschedule-${task.id}`} className="shrink-0 text-xs">
                        {t("taskLimitDate")}
                      </Label>
                      <Input
                        id={`task-reschedule-${task.id}`}
                        type="date"
                        value={rescheduleDate}
                        onChange={(e) => setRescheduleDate(e.target.value)}
                        className="h-8 sm:w-44"
                        disabled={busy}
                      />
                      <div className="flex gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void confirmReschedule(task)}
                          loading={busy}
                        >
                          {t("save")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setRescheduleId(null)}
                          disabled={busy}
                        >
                          {t("cancel")}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
          <ListTodo className="h-4 w-4 text-muted-foreground" />
          {t("tasksTitle")}
        </h3>
        {!formOpen && status !== "loading" && (
          <Button type="button" variant="outline" size="sm" onClick={() => setFormOpen(true)}>
            <Plus />
            {t("newTask")}
          </Button>
        )}
      </div>

      {formOpen && (
        <Card>
          <CardContent className="space-y-3 p-3 sm:p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_11rem]">
              <div className="space-y-1.5">
                <Label htmlFor="relationship-task-name">{t("taskName")} *</Label>
                <Input
                  id="relationship-task-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  disabled={creating}
                  aria-invalid={formAttempted && !formName.trim()}
                  className={cn(formAttempted && !formName.trim() && "border-destructive")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="relationship-task-date">{t("taskLimitDate")} *</Label>
                <Input
                  id="relationship-task-date"
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  disabled={creating}
                  aria-invalid={formAttempted && !deadlineParts(formDate)}
                  className={cn(formAttempted && !deadlineParts(formDate) && "border-destructive")}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="relationship-task-description">{t("taskDescription")}</Label>
              <Textarea
                id="relationship-task-description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={2}
                disabled={creating}
              />
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  resetForm();
                  setFormOpen(false);
                }}
                disabled={creating}
              >
                {t("cancel")}
              </Button>
              <Button type="button" size="sm" onClick={handleCreate} loading={creating}>
                {t("createTask")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {body}
    </section>
  );
}

export default RelationshipTab;
