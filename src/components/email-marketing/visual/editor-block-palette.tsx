"use client";

import { useTranslations } from "next-intl";
import { useDraggable } from "@dnd-kit/core";
import { LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EMAIL_BLOCK_TYPES, type EmailBlockType, type EmailStarterKind } from "@/lib/email-design";
import { BLOCK_ICONS, PALETTE_DRAG_PREFIX, useBlockLabel, type PaletteDragData } from "./editor-shared";

export interface EditorBlockPaletteProps {
  /** column = coluna do computador; strip = faixa rolável do celular */
  layout: "column" | "strip";
  canAdd: boolean;
  onAdd: (type: EmailBlockType) => void;
  onStarter: (kind: EmailStarterKind) => void;
}

function PaletteItem({
  type,
  layout,
  disabled,
  onAdd,
}: {
  type: EmailBlockType;
  layout: "column" | "strip";
  disabled: boolean;
  onAdd: (type: EmailBlockType) => void;
}) {
  const blockLabel = useBlockLabel();
  const Icon = BLOCK_ICONS[type];
  const data: PaletteDragData = { from: "palette", type };
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `${PALETTE_DRAG_PREFIX}${type}`,
    data,
    disabled,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      disabled={disabled}
      onClick={() => onAdd(type)}
      // Só o ponteiro arrasta da paleta: Enter/Espaço continuam sendo "clique = adicionar"
      // e, no toque, a faixa rola em vez de iniciar um arraste
      onPointerDown={event => {
        if (event.pointerType === "touch") return;
        listeners?.onPointerDown?.(event);
      }}
      className={cn(
        "border bg-background font-medium text-foreground transition-colors hover:border-primary/60 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50",
        layout === "column"
          ? "flex min-h-[4.25rem] min-w-0 flex-col items-center justify-center gap-1.5 rounded-md px-1.5 py-2.5 text-xs"
          : "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs",
        isDragging && "opacity-50"
      )}
    >
      <Icon className={cn("shrink-0 text-muted-foreground", layout === "column" ? "h-5 w-5" : "h-4 w-4")} aria-hidden />
      <span className={cn(layout === "column" && "max-w-full break-words text-center leading-tight")}>{blockLabel(type)}</span>
    </button>
  );
}

/** Cartão exibido sob o ponteiro enquanto um bloco é arrastado da paleta */
export function PaletteDragPreview({ type }: { type: EmailBlockType }) {
  const blockLabel = useBlockLabel();
  const Icon = BLOCK_ICONS[type];
  return (
    <div className="inline-flex cursor-grabbing items-center gap-2 rounded-md border bg-popover px-3 py-2 text-xs font-medium text-popover-foreground shadow-lg">
      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
      {blockLabel(type)}
    </div>
  );
}

export function EditorBlockPalette({ layout, canAdd, onAdd, onStarter }: EditorBlockPaletteProps) {
  const t = useTranslations("emailVisualEditor");

  const starters = (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("gap-1.5 text-xs", layout === "column" ? "w-full justify-start" : "shrink-0 rounded-full")}
        onClick={() => onStarter("welcome")}
      >
        <LayoutTemplate aria-hidden />
        {t("starterWelcome")}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("gap-1.5 text-xs", layout === "column" ? "w-full justify-start" : "shrink-0 rounded-full")}
        onClick={() => onStarter("news")}
      >
        <LayoutTemplate aria-hidden />
        {t("starterNews")}
      </Button>
    </>
  );

  if (layout === "strip") {
    return (
      <div className="space-y-1.5">
        <div role="group" aria-label={t("blocks")} className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
          {EMAIL_BLOCK_TYPES.map(type => (
            <PaletteItem key={type} type={type} layout="strip" disabled={!canAdd} onAdd={onAdd} />
          ))}
          <span className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden />
          {starters}
        </div>
        {!canAdd && <p className="text-xs text-amber-700 dark:text-amber-400">{t("limitBlocks")}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">{t("blocks")}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("blocksHint")}</p>
      </div>
      <div role="group" aria-label={t("blocks")} className="grid grid-cols-2 gap-2">
        {EMAIL_BLOCK_TYPES.map(type => (
          <PaletteItem key={type} type={type} layout="column" disabled={!canAdd} onAdd={onAdd} />
        ))}
      </div>
      {!canAdd && <p className="text-xs text-amber-700 dark:text-amber-400">{t("limitBlocks")}</p>}
      <div className="space-y-2 border-t pt-3">{starters}</div>
    </div>
  );
}
