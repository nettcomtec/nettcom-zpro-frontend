"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Folder, FolderInput, FolderPlus, FolderX, Info, Loader2, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBackendErrorCode } from "@/lib/backend-error-code";
import { normalizeForSearch } from "@/lib/text-search";
import {
  createGalleryFolder,
  deleteGalleryFolder,
  fetchGalleryFolders,
  isGalleryFolderMissingError,
  moveGalleryItems,
  renameGalleryFolder,
  type GalleryFolder,
} from "@/services/gallery";

/** Mesmo teto do backend (contado em caracteres, não em unidades UTF-16). */
const FOLDER_NAME_MAX = 60;

/** 403 sem permissão já ganha o aviso global do interceptor: a tela não repete. */
function isNoPermission(err: unknown): boolean {
  return getBackendErrorCode(err) === "ERR_NO_PERMISSION";
}

/**
 * Fecha no próximo frame em vez de no mesmo clique/toque: no toque o DismissableLayer do
 * Radix confere o "clique fora" no evento click, e desmontar a camada no mesmo clique fazia a
 * camada de baixo ser fechada junto (molde: gallery-picker-with-upload-dialog).
 */
function closeNextFrame(onOpenChange: (open: boolean) => void) {
  requestAnimationFrame(() => onOpenChange(false));
}

// ─── Criar / renomear pasta ─────────────────────────────────────────────────

export type FolderNameDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "rename";
  /** Pasta a renomear (modo "rename"). */
  folder?: GalleryFolder | null;
  onSaved?: (folder: { id: number; name: string }) => void;
  /** A pasta não existe mais (ou a instalação ficou sem pastas): a tela recarrega e volta a "Todos". */
  onFolderMissing?: () => void;
};

export function FolderNameDialog({
  open,
  onOpenChange,
  mode,
  folder,
  onSaved,
  onFolderMissing,
}: FolderNameDialogProps) {
  const t = useTranslations("galeriaPage");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const folderId = folder?.id;
  const folderName = folder?.name;
  useEffect(() => {
    if (!open) return;
    setName(mode === "rename" ? folderName ?? "" : "");
    setError(null);
    setSaving(false);
  }, [open, mode, folderId, folderName]);

  const length = Array.from(name).length;

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (saving) return;
    const trimmed = name.replace(/\s+/g, " ").trim();
    if (!trimmed) {
      setError(t("folderNameRequired"));
      return;
    }
    if (Array.from(trimmed).length > FOLDER_NAME_MAX) {
      setError(t("folderNameTooLong"));
      return;
    }
    if (mode === "rename") {
      if (!folder) return;
      if (trimmed === folder.name) {
        closeNextFrame(onOpenChange);
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      if (mode === "create") {
        const created = await createGalleryFolder(trimmed);
        toast.success(t("folderCreated"));
        onSaved?.({ id: created.id, name: created.name });
      } else {
        const renamed = await renameGalleryFolder(folder!.id, trimmed);
        toast.success(t("folderRenamed"));
        onSaved?.(renamed);
      }
      closeNextFrame(onOpenChange);
    } catch (err) {
      const code = getBackendErrorCode(err);
      if (code === "ERR_GALLERY_FOLDER_NAME_REQUIRED") setError(t("folderNameRequired"));
      else if (code === "ERR_GALLERY_FOLDER_NAME_TOO_LONG") setError(t("folderNameTooLong"));
      else if (code === "ERR_GALLERY_FOLDER_NAME_EXISTS") setError(t("folderNameExists"));
      else if (code === "ERR_GALLERY_FOLDER_LIMIT") setError(t("folderLimit"));
      else if (isGalleryFolderMissingError(err)) {
        toast.error(t("folderMissing"));
        onFolderMissing?.();
        closeNextFrame(onOpenChange);
      } else if (!isNoPermission(err)) {
        toast.error(t("folderError"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {mode === "create" ? <FolderPlus className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
              {mode === "create" ? t("newFolder") : t("renameFolder")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="gallery-folder-name">{t("folderNameLabel")}</Label>
            <Input
              id="gallery-folder-name"
              autoComplete="off"
              value={name}
              // Sem maxLength: ele conta unidades UTF-16 (emoji = 2) e cortaria calado; o teto
              // de 60 caracteres é o do contador, da validação abaixo e do servidor.
              placeholder={t("folderNamePlaceholder")}
              // 16 px no celular: abaixo disso o iOS dá zoom ao focar o campo.
              className="text-base md:text-sm"
              aria-invalid={!!error}
              error={error ?? undefined}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
            />
            <p className="text-right text-xs tabular-nums text-muted-foreground">
              {length}/{FOLDER_NAME_MAX}
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" loading={saving}>
              {mode === "create" ? t("create") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Excluir pasta ──────────────────────────────────────────────────────────

export type DeleteFolderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: GalleryFolder | null;
  /**
   * true = `folder.count` já é o total da pasta (tela sem filtro de tipo). false = a contagem
   * segue o tipo selecionado (D17), mas a exclusão leva TODOS os arquivos para "Sem pasta":
   * o diálogo busca o total antes de mostrar o número.
   */
  countIsTotal?: boolean;
  onDeleted?: (folder: GalleryFolder, movedCount: number) => void;
  onFolderMissing?: () => void;
};

export function DeleteFolderDialog({
  open,
  onOpenChange,
  folder,
  countIsTotal = false,
  onDeleted,
  onFolderMissing,
}: DeleteFolderDialogProps) {
  const t = useTranslations("galeriaPage");
  const [deleting, setDeleting] = useState(false);
  const [total, setTotal] = useState<number | null>(null);

  const folderId = folder?.id;
  const folderCount = folder?.count ?? 0;
  useEffect(() => {
    if (!open || folderId == null) return;
    setDeleting(false);
    if (countIsTotal) {
      setTotal(folderCount);
      return;
    }
    setTotal(null);
    let cancelled = false;
    void fetchGalleryFolders().then((state) => {
      if (cancelled) return;
      const found = state.folders.find((f) => f.id === folderId);
      setTotal(found ? found.count : folderCount);
    });
    return () => {
      cancelled = true;
    };
  }, [open, folderId, folderCount, countIsTotal]);

  const handleDelete = async () => {
    if (!folder || deleting) return;
    setDeleting(true);
    try {
      const { movedCount } = await deleteGalleryFolder(folder.id);
      toast.success(t("folderDeleted", { count: movedCount }));
      onDeleted?.(folder, movedCount);
      closeNextFrame(onOpenChange);
    } catch (err) {
      if (isGalleryFolderMissingError(err)) {
        toast.error(t("folderMissing"));
        onFolderMissing?.();
        closeNextFrame(onOpenChange);
      } else if (!isNoPermission(err)) {
        toast.error(t("folderError"));
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!deleting) onOpenChange(next);
      }}
    >
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteFolderConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription className="break-words">
            {total === null ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              t("deleteFolderConfirm", { name: folder?.name ?? "", count: total })
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>{t("cancel")}</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            loading={deleting}
            disabled={total === null}
            onClick={handleDelete}
          >
            {deleting ? t("deleting") : t("deleteFolder")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Mover para… ────────────────────────────────────────────────────────────

export type MoveToDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Arquivos a mover (o serviço fatia em partes de 500). */
  itemIds: number[];
  folders: GalleryFolder[];
  /**
   * Pasta em que TODOS os arquivos já estão: a opção fica desabilitada. null = todos em
   * "Sem pasta"; undefined = mistura ou desconhecido (nenhuma opção desabilitada).
   */
  currentFolderId?: number | null;
  onMoved?: (result: { moved: number; folderId: number | null; ids: number[] }) => void;
  /** A pasta de destino não existe mais: a tela recarrega as pastas e volta a "Todos". */
  onFolderMissing?: () => void;
  /** Falha genérica (num lote grande, parte pode ter sido movida): a tela recarrega. */
  onFailed?: () => void;
};

export function MoveToDialog({
  open,
  onOpenChange,
  itemIds,
  folders,
  currentFolderId,
  onMoved,
  onFolderMissing,
  onFailed,
}: MoveToDialogProps) {
  const t = useTranslations("galeriaPage");
  const [query, setQuery] = useState("");
  const [moving, setMoving] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setMoving(false);
    setPendingTarget(undefined);
  }, [open]);

  const needle = normalizeForSearch(query.trim());
  const unfiledLabel = t("unfiled");
  const showUnfiled = !needle || normalizeForSearch(unfiledLabel).includes(needle);
  const visibleFolders = useMemo(
    () => (needle ? folders.filter((f) => normalizeForSearch(f.name).includes(needle)) : folders),
    [folders, needle],
  );

  const handleMove = async (target: number | null) => {
    if (moving || itemIds.length === 0) return;
    setMoving(true);
    setPendingTarget(target);
    const ids = [...itemIds];
    try {
      const { moved } = await moveGalleryItems(ids, target);
      // Nenhum (ou só parte) movido: arquivos excluídos por outra pessoa no meio. Nunca "sucesso"
      // com 0; parcial avisa quantos foram de fato.
      if (moved === 0) toast.error(t("moveError"));
      else if (moved < ids.length) toast.warning(t("moveSuccess", { count: moved }));
      else toast.success(t("moveSuccess", { count: moved }));
      onMoved?.({ moved, folderId: target, ids });
      closeNextFrame(onOpenChange);
    } catch (err) {
      if (isGalleryFolderMissingError(err)) {
        toast.error(t("folderMissing"));
        onFolderMissing?.();
        closeNextFrame(onOpenChange);
      } else {
        if (!isNoPermission(err)) toast.error(t("moveError"));
        onFailed?.();
      }
    } finally {
      setMoving(false);
      setPendingTarget(undefined);
    }
  };

  const itemContent = (icon: React.ReactNode, label: string, isCurrent: boolean, isPending: boolean) => (
    <>
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {isPending ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : isCurrent ? (
        <Check className="text-muted-foreground" aria-hidden />
      ) : null}
    </>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!moving) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderInput className="h-4 w-4" />
            {t("moveTo")}
          </DialogTitle>
          <DialogDescription>{t("selectedCount", { count: itemIds.length })}</DialogDescription>
        </DialogHeader>

        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{t("moveToHint")}</span>
        </p>

        {/* Busca própria (sem o filtro do cmdk): ignora acento e caixa, e o valor de cada
            item é o id, para "Sem pasta" nunca colidir com uma pasta de mesmo nome. */}
        <Command shouldFilter={false} className="rounded-md border">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t("moveToSearch")}
            className="text-base md:text-sm"
            disabled={moving}
          />
          <CommandList className="max-h-[45dvh] sm:max-h-[300px]">
            <CommandEmpty>{t("moveToEmpty")}</CommandEmpty>
            <CommandGroup>
              {showUnfiled && (
                <CommandItem
                  value="__unfiled__"
                  disabled={moving || currentFolderId === null}
                  onSelect={() => void handleMove(null)}
                >
                  {itemContent(
                    <FolderX className="text-muted-foreground" />,
                    unfiledLabel,
                    currentFolderId === null,
                    moving && pendingTarget === null,
                  )}
                </CommandItem>
              )}
              {visibleFolders.map((folder) => (
                <CommandItem
                  key={folder.id}
                  value={`folder-${folder.id}`}
                  disabled={moving || currentFolderId === folder.id}
                  onSelect={() => void handleMove(folder.id)}
                >
                  {itemContent(
                    <Folder className="text-muted-foreground" />,
                    folder.name,
                    currentFolderId === folder.id,
                    moving && pendingTarget === folder.id,
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={moving} onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
