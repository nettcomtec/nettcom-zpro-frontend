"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertCircle, Handshake, Loader2, Lock, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { isFeatureNotInPlanError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import {
  createRelationshipType,
  createSuggestedRelationshipTypes,
  deleteRelationshipType,
  fetchRelationshipTypes,
  updateRelationshipType,
  type RelationshipType,
} from "@/services/relationship";

// PLANO_CRM_CONTATO D17 — nomes criados no idioma de quem clica.
const SUGGESTED_KEYS = [
  "callMade",
  "callMissed",
  "whatsappSent",
  "whatsappReplied",
  "emailSent",
  "emailReplied",
  "proposalSent",
  "proposalApproved",
  "proposalRejected",
  "visitScheduled",
  "visitDone",
  "meetingDone",
  "followUp",
  "chargeDone",
] as const;

const COLOR_PALETTE = [
  "#3B82F6", "#6366F1", "#8B5CF6", "#EC4899", "#EF4444",
  "#F97316", "#F59E0B", "#10B981", "#14B8A6", "#64748B",
];
const DEFAULT_COLOR = COLOR_PALETTE[0];
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const NAME_MAX = 80;

type LoadState = "ok" | "feature" | "forbidden" | "error";

// O interceptor rejeita com `error.response || error`: status/data podem vir na raiz.
const errorStatus = (err: unknown): number | undefined => {
  const e = err as { status?: number; response?: { status?: number } } | null;
  return e?.status ?? e?.response?.status;
};
const errorCode = (err: unknown): string | undefined => {
  const e = err as { data?: { error?: string }; response?: { data?: { error?: string } } } | null;
  return e?.data?.error ?? e?.response?.data?.error;
};

function ColorDot({ color, className }: { color: string | null; className?: string }) {
  return (
    <span
      className={cn("inline-block h-3 w-3 shrink-0 rounded-full ring-1 ring-border", !color && "bg-muted", className)}
      style={color ? { backgroundColor: color } : undefined}
      aria-hidden
    />
  );
}

export default function RelacionamentoTiposPage() {
  const t = useTranslations("relationship");

  // D26: admin, superadmin, supervisor com acesso de admin (isSupervisorAdmin() true =
  // supervisor LIMITADO) e custom com relationship_manage. Nunca `hasPermission`
  // sozinho — ele devolve true para todo perfil não-custom.
  const canManage = useAuthStore((s) => {
    const profile = s.user?.profile;
    if (profile === "admin" || profile === "superadmin") return true;
    if (profile === "super") return !s.isSupervisorAdmin();
    if (profile === "custom") return s.hasPermission("relationship_manage");
    return false;
  });
  // O valor de supervisorAdmin só é confiável depois do fetch do tenant.
  const permissionPending = useAuthStore((s) => s.user?.profile === "super" && !s.tenantConfigsLoaded);
  const featureEnabled = useAuthStore((s) => s.hasFeature("relationship"));

  const [types, setTypes] = useState<RelationshipType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadState, setLoadState] = useState<LoadState>("ok");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RelationshipType | null>(null);
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState(DEFAULT_COLOR);
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<RelationshipType | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<number>>(new Set());
  const [addingSuggested, setAddingSuggested] = useState(false);

  // Descarta respostas de cargas antigas (ex.: recarga silenciosa em corrida com outra).
  const loadSeq = useRef(0);

  const canLoad = featureEnabled && canManage && !permissionPending;

  const load = useCallback(async (silent = false) => {
    const seq = ++loadSeq.current;
    if (!silent) setLoading(true);
    try {
      const { data } = await fetchRelationshipTypes({ includeInactive: true, background: true });
      if (seq !== loadSeq.current) return;
      setTypes(Array.isArray(data) ? data : []);
      setLoadState("ok");
    } catch (err) {
      if (seq !== loadSeq.current) return;
      if (isFeatureNotInPlanError(err) || errorStatus(err) === 402) {
        setLoadState("feature");
      } else if (errorStatus(err) === 403) {
        setLoadState("forbidden");
      } else {
        setLoadState("error");
      }
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canLoad) return;
    load();
  }, [canLoad, load]);

  const toastMutationError = (err: unknown) => {
    // 402 de recurso fora do plano já ganha toast global do interceptor.
    if (isFeatureNotInPlanError(err)) return;
    if (errorStatus(err) === 409 || errorCode(err) === "ERR_RELATIONSHIP_TYPE_DUPLICATE") {
      toast.error(t("typeDuplicate"));
      return;
    }
    toast.error(t("typeError"));
  };

  const openCreate = () => {
    setEditing(null);
    setFormName("");
    setFormColor(DEFAULT_COLOR);
    setFormOpen(true);
  };

  const openEdit = (type: RelationshipType) => {
    setEditing(type);
    setFormName(type.name);
    setFormColor(type.color && HEX_COLOR.test(type.color) ? type.color : DEFAULT_COLOR);
    setFormOpen(true);
  };

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const name = formName.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      if (editing) {
        await updateRelationshipType(editing.id, { name, color: formColor });
        toast.success(t("typeUpdated"));
      } else {
        await createRelationshipType({ name, color: formColor });
        toast.success(t("typeCreated"));
      }
      setFormOpen(false);
      await load(true);
    } catch (err) {
      toastMutationError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (type: RelationshipType, next: boolean) => {
    if (togglingIds.has(type.id)) return;
    setTogglingIds((prev) => new Set(prev).add(type.id));
    setTypes((prev) => prev.map((x) => (x.id === type.id ? { ...x, isActive: next } : x)));
    try {
      await updateRelationshipType(type.id, { isActive: next });
      toast.success(t("typeUpdated"));
    } catch (err) {
      setTypes((prev) => prev.map((x) => (x.id === type.id ? { ...x, isActive: type.isActive } : x)));
      toastMutationError(err);
    } finally {
      setTogglingIds((prev) => {
        const copy = new Set(prev);
        copy.delete(type.id);
        return copy;
      });
    }
  };

  const handleDelete = async () => {
    if (!deleting || deleteBusy) return;
    const target = deleting;
    setDeleteBusy(true);
    try {
      const { data } = await deleteRelationshipType(target.id);
      if (data && typeof data === "object" && data.deactivated) {
        toast.success(t("typeDeactivated"));
        setTypes((prev) => prev.map((x) => (x.id === target.id ? { ...x, isActive: false, inUse: true } : x)));
      } else {
        toast.success(t("typeDeleted"));
        setTypes((prev) => prev.filter((x) => x.id !== target.id));
      }
      setDeleting(null);
    } catch (err) {
      toastMutationError(err);
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleAddSuggested = async () => {
    if (addingSuggested) return;
    setAddingSuggested(true);
    try {
      const names = SUGGESTED_KEYS.map((key) => t(`suggested.${key}`));
      const { data } = await createSuggestedRelationshipTypes(names);
      const count = Array.isArray(data) ? data.length : 0;
      if (count > 0) {
        toast.success(t("suggestedAdded", { count }));
        await load(true);
      } else {
        toast.info(t("noSuggestedAdded"));
      }
    } catch (err) {
      toastMutationError(err);
    } finally {
      setAddingSuggested(false);
    }
  };

  const pageHelp = {
    description: t("helpDesc"),
    sections: [
      { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1")] },
      { title: t("helpS1T"), items: [t("helpS1I0")] },
    ],
  };

  const header = (actions?: React.ReactNode) => (
    <PageHeader title={t("typesTitle")} description={t("typesDescription")} help={pageHelp}>
      {actions}
    </PageHeader>
  );

  if (!featureEnabled || (canLoad && loadState === "feature")) {
    return (
      <div className="space-y-6">
        {header()}
        <EmptyState icon={Lock} title={t("featureUnavailable")} />
      </div>
    );
  }

  if (permissionPending) {
    return (
      <div className="space-y-6">
        {header()}
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!canManage || loadState === "forbidden") {
    return (
      <div className="space-y-6">
        {header()}
        <EmptyState icon={Lock} title={t("noPermission")} />
      </div>
    );
  }

  const busyActions = loading || loadState === "error";

  const headerActions = (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleAddSuggested}
        disabled={busyActions || addingSuggested}
        className="gap-1.5"
      >
        {addingSuggested ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {t("addSuggested")}
      </Button>
      <Button size="sm" onClick={openCreate} disabled={busyActions} className="gap-1.5">
        <Plus className="h-4 w-4" />
        {t("newType")}
      </Button>
    </>
  );

  const renderActions = (type: RelationshipType) => (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => openEdit(type)}
        aria-label={t("edit")}
        title={t("edit")}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive"
        onClick={() => setDeleting(type)}
        aria-label={t("delete")}
        title={t("delete")}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );

  const renderStatus = (type: RelationshipType) => (
    <label className="inline-flex items-center gap-2 text-sm">
      <Switch
        checked={type.isActive}
        disabled={togglingIds.has(type.id)}
        onCheckedChange={(checked) => handleToggle(type, checked)}
        aria-label={type.isActive ? t("typeActive") : t("typeInactive")}
      />
      <span className={cn(!type.isActive && "text-muted-foreground")}>
        {type.isActive ? t("typeActive") : t("typeInactive")}
      </span>
    </label>
  );

  return (
    <div className="space-y-6">
      {header(headerActions)}

      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : loadState === "error" ? (
        <EmptyState icon={AlertCircle} title={t("loadError")}>
          <Button variant="outline" onClick={() => load()}>
            {t("retry")}
          </Button>
        </EmptyState>
      ) : types.length === 0 ? (
        <EmptyState icon={Handshake} title={t("emptyTypes")}>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" onClick={handleAddSuggested} disabled={addingSuggested} className="gap-1.5">
              {addingSuggested ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {t("addSuggested")}
            </Button>
            <Button onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" />
              {t("newType")}
            </Button>
          </div>
        </EmptyState>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("typeName")}</TableHead>
                  <TableHead className="w-48">{t("typeActive")}</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {types.map((type) => (
                  <TableRow key={type.id}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2">
                        <ColorDot color={type.color} />
                        <span className={cn("truncate font-medium", !type.isActive && "text-muted-foreground")}>
                          {type.name}
                        </span>
                        {type.inUse && (
                          <Badge variant="secondary" className="shrink-0 text-xs">
                            {t("inUse")}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{renderStatus(type)}</TableCell>
                    <TableCell>{renderActions(type)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile */}
          <div className="space-y-2 md:hidden">
            {types.map((type) => (
              <div key={type.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <ColorDot color={type.color} />
                    <span className={cn("break-words font-medium", !type.isActive && "text-muted-foreground")}>
                      {type.name}
                    </span>
                    {type.inUse && (
                      <Badge variant="secondary" className="text-xs">
                        {t("inUse")}
                      </Badge>
                    )}
                  </div>
                  {renderActions(type)}
                </div>
                <div className="mt-2">{renderStatus(type)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Criar / editar */}
      <Dialog open={formOpen} onOpenChange={(open) => { if (!saving) setFormOpen(open); }}>
        <DialogContent>
          <form onSubmit={handleSave} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{editing ? t("edit") : t("newType")}</DialogTitle>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor="relationship-type-name">{t("typeName")}</Label>
              <Input
                id="relationship-type-name"
                value={formName}
                maxLength={NAME_MAX}
                onChange={(e) => setFormName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="relationship-type-color">{t("typeColor")}</Label>
              <div className="flex flex-wrap items-center gap-2">
                {COLOR_PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setFormColor(color)}
                    aria-label={color}
                    aria-pressed={formColor.toLowerCase() === color.toLowerCase()}
                    className={cn(
                      "h-7 w-7 rounded-full ring-offset-2 ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      formColor.toLowerCase() === color.toLowerCase() ? "ring-2 ring-foreground" : "ring-1 ring-border"
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
                <Input
                  id="relationship-type-color"
                  type="color"
                  value={formColor}
                  onChange={(e) => setFormColor(e.target.value)}
                  className="h-8 w-12 cursor-pointer p-1"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={saving || !formName.trim()}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {saving ? t("saving") : t("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Excluir */}
      <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open && !deleteBusy) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTypeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteTypeDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          {deleting && (
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <ColorDot color={deleting.color} />
              <span className="truncate font-medium">{deleting.name}</span>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>{t("cancel")}</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteBusy}>
              {deleteBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
