"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Files, Folder, FolderOpen, FolderPlus, FolderX, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { GalleryFolder, GalleryFolderFilterValue } from "@/services/gallery";

export type GalleryFolderFilterProps = {
  /** "horizontal" = chips com rolagem (seletor, modal do atendimento, página no celular);
   *  "vertical" = barra lateral da página no computador. */
  orientation: "horizontal" | "vertical";
  value: GalleryFolderFilterValue;
  onChange: (value: GalleryFolderFilterValue) => void;
  /** false = backend sem pastas: o componente não renderiza nada. */
  available: boolean;
  folders: GalleryFolder[];
  unfiledCount: number;
  totalCount: number;
  /** Mostra "Nova pasta" e o menu de cada pasta (Renomear/Excluir). */
  canManage?: boolean;
  onCreateFolder?: () => void;
  onRenameFolder?: (folder: GalleryFolder) => void;
  onDeleteFolder?: (folder: GalleryFolder) => void;
  className?: string;
};

/**
 * Filtro de pastas da galeria (PLANO_GALERIA_PASTAS §5.4 item 3): "Todos", "Sem pasta" e as
 * pastas, cada um com a quantidade de arquivos (que segue o filtro de tipo de quem chamou).
 */
export function GalleryFolderFilter({
  orientation,
  value,
  onChange,
  available,
  folders,
  unfiledCount,
  totalCount,
  canManage = false,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  className,
}: GalleryFolderFilterProps) {
  const t = useTranslations("galeriaPage");
  if (!available) return null;

  const showMenu = canManage && (!!onRenameFolder || !!onDeleteFolder);

  const folderMenu = (folder: GalleryFolder, triggerClassName?: string) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("folderActions")}
          className={cn(
            "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            triggerClassName,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {onRenameFolder && (
          <DropdownMenuItem onSelect={() => onRenameFolder(folder)}>
            <Pencil className="mr-2 h-4 w-4" />
            {t("renameFolder")}
          </DropdownMenuItem>
        )}
        {onDeleteFolder && (
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => onDeleteFolder(folder)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("deleteFolder")}
              </DropdownMenuItem>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-[240px]">
              {t("deleteFolderHint")}
            </TooltipContent>
          </Tooltip>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (orientation === "horizontal") {
    const chip = (
      key: string,
      selected: boolean,
      onClick: () => void,
      label: string,
      count: number | null,
      icon: React.ReactNode,
    ) => (
      <button
        key={key}
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        className={cn(
          "inline-flex h-8 max-w-[220px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
          selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-background text-foreground hover:bg-accent",
        )}
      >
        {icon}
        <span className="truncate">{label}</span>
        {count !== null && (
          <span className={cn("tabular-nums", selected ? "opacity-90" : "text-muted-foreground")}>({count})</span>
        )}
      </button>
    );

    return (
      <TooltipProvider delayDuration={200}>
        <div
          className={cn("flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]", className)}
          role="toolbar"
          aria-label={t("foldersTitle")}
        >
          {chip("all", value === "all", () => onChange("all"), t("allFiles"), totalCount, <Files className="h-3.5 w-3.5 shrink-0" />)}
          {chip("none", value === "none", () => onChange("none"), t("unfiled"), unfiledCount, <FolderX className="h-3.5 w-3.5 shrink-0" />)}
          {folders.map((folder) => {
            const selected = value === folder.id;
            return (
              <div key={folder.id} className="flex shrink-0 items-center">
                {chip(
                  `f-${folder.id}`,
                  selected,
                  () => onChange(folder.id),
                  folder.name,
                  folder.count,
                  selected ? <FolderOpen className="h-3.5 w-3.5 shrink-0" /> : <Folder className="h-3.5 w-3.5 shrink-0" />,
                )}
                {showMenu && selected && folderMenu(folder, "ml-0.5")}
              </div>
            );
          })}
          {canManage && onCreateFolder && (
            <button
              type="button"
              onClick={onCreateFolder}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-dashed px-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              {t("newFolder")}
            </button>
          )}
        </div>
      </TooltipProvider>
    );
  }

  const row = (
    key: string,
    selected: boolean,
    onClick: () => void,
    label: string,
    count: number,
    icon: React.ReactNode,
    menu?: React.ReactNode,
  ) => (
    <div
      key={key}
      className={cn(
        "group flex items-center gap-1 rounded-md pr-1 transition-colors",
        selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        aria-current={selected ? "true" : undefined}
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm"
      >
        {icon}
        <span className={cn("min-w-0 flex-1 truncate", selected && "font-medium")}>{label}</span>
        <span
          className={cn(
            "shrink-0 text-xs tabular-nums",
            // Na linha selecionada o fundo é o de destaque: o cinza some nele.
            selected ? "text-accent-foreground/80" : "text-muted-foreground",
          )}
        >
          {count}
        </span>
      </button>
      {menu}
    </div>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <nav className={cn("flex flex-col gap-0.5", className)} aria-label={t("foldersTitle")}>
        <div className="mb-1 flex items-center justify-between gap-2 px-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("foldersTitle")}
          </span>
          {canManage && onCreateFolder && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={onCreateFolder}
                  aria-label={t("newFolder")}
                >
                  <FolderPlus />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{t("newFolder")}</TooltipContent>
            </Tooltip>
          )}
        </div>
        {row("all", value === "all", () => onChange("all"), t("allFiles"), totalCount, <Files className="h-4 w-4 shrink-0 text-muted-foreground" />)}
        {row("none", value === "none", () => onChange("none"), t("unfiled"), unfiledCount, <FolderX className="h-4 w-4 shrink-0 text-muted-foreground" />)}
        {folders.map((folder) => {
          const selected = value === folder.id;
          return row(
            `f-${folder.id}`,
            selected,
            () => onChange(folder.id),
            folder.name,
            folder.count,
            selected ? (
              <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
            ) : (
              <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
            ),
            showMenu
              ? folderMenu(
                  folder,
                  cn(
                    "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 [@media(hover:none)]:opacity-100 data-[state=open]:opacity-100",
                    // Linha selecionada: o ⋮ aparece sempre e na cor do destaque.
                    selected && "md:opacity-100 text-accent-foreground hover:bg-background/20 hover:text-accent-foreground",
                  ),
                )
              : undefined,
          );
        })}
        {canManage && onCreateFolder && (
          <button
            type="button"
            onClick={onCreateFolder}
            className="mt-1 flex items-center gap-2 rounded-md border border-dashed px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <FolderPlus className="h-4 w-4 shrink-0" />
            {t("newFolder")}
          </button>
        )}
      </nav>
    </TooltipProvider>
  );
}
