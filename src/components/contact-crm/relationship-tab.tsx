"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  AlertTriangle, ChevronDown, Download, Handshake, Loader2, Paperclip, Pencil, Plus, RotateCw, Settings2, ShieldOff,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { ContactTasksCard } from "@/components/tasks/contact-tasks-card";
import {
  RelationshipFormDialog, formatFileSize, relationshipErrorCode, relationshipErrorCodeAsync,
  relationshipErrorMessage, safeTypeColor,
} from "@/components/contact-crm/relationship-form-dialog";
import { useLiveMode } from "@/hooks/use-live-mode";
import { isFeatureNotInPlanError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  deleteRelationship, downloadRelationshipAttachment, fetchRelationshipTypes, fetchRelationships,
  type RelationshipAttachmentInfo, type RelationshipItem, type RelationshipType,
} from "@/services/relationship";
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

      {tasksEnabled && <ContactTasksCard contactId={contactId} ticketId={hintTicketId} variant="page" />}

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

export default RelationshipTab;
