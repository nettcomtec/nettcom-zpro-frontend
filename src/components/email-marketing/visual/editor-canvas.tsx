"use client";

import { memo, useMemo, type KeyboardEvent, type MouseEvent } from "react";
import { useTranslations } from "next-intl";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, ArrowDown, ArrowUp, Copy, GripVertical, ImagePlus, LayoutTemplate, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  EMAIL_DESIGN_VERSION,
  getBlockIssue,
  isValidEmailImageSrc,
  renderBlockHtml,
  type EmailBlock,
  type EmailDesign,
  type EmailDesignSettings,
  type EmailStarterKind,
} from "@/lib/email-design";
import { CANVAS_DROP_ID, blockExcerpt, sanitizeEmailMarkup, useBlockLabel, useIsClient } from "./editor-shared";

export interface CanvasDropTarget {
  /** id do bloco, ou CANVAS_DROP_ID = fim do e-mail */
  id: string;
  after: boolean;
}

export interface EditorCanvasProps {
  design: EmailDesign;
  selectedId: string | null;
  dropTarget: CanvasDropTarget | null;
  /** Área "fim do e-mail" só existe no arraste da paleta — no reordenar pelo teclado ela
   *  entraria nas coordenadas do dnd-kit e o bloco pularia para o topo */
  paletteDragging: boolean;
  canAdd: boolean;
  onSelect: (id: string) => void;
  onClearSelection: () => void;
  onMove: (id: string, delta: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onStarter: (kind: EmailStarterKind) => void;
}

interface CanvasBlockProps {
  block: EmailBlock;
  settings: EmailDesignSettings;
  isFirst: boolean;
  isLast: boolean;
  selected: boolean;
  dropEdge: "before" | "after" | null;
  canDuplicate: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
}

const actionButtonClass =
  "inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-40 [&_svg]:h-3.5 [&_svg]:w-3.5";

/**
 * Um bloco no canvas. memo: digitar num bloco só re-renderiza ele — `updateBlock`
 * preserva a identidade dos demais e os callbacks do editor são estáveis.
 */
const CanvasBlock = memo(function CanvasBlock({
  block,
  settings,
  isFirst,
  isLast,
  selected,
  dropEdge,
  canDuplicate,
  onSelect,
  onMove,
  onDuplicate,
  onRemove,
}: CanvasBlockProps) {
  const t = useTranslations("emailVisualEditor");
  const tc = useTranslations("common");
  const blockLabel = useBlockLabel();
  const isClient = useIsClient();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
    data: { from: "canvas" },
  });

  const imageMissing = block.type === "image" && !isValidEmailImageSrc(block.src);
  // Canvas: `<a>` vira `<span>` (forCanvas) e o HTML ainda passa pelo DOMPurify — designs
  // chegam de colegas e de arquivos importados
  const html = useMemo(() => {
    if (imageMissing) return "";
    const design: EmailDesign = { version: EMAIL_DESIGN_VERSION, settings, blocks: [] };
    return sanitizeEmailMarkup(renderBlockHtml(block, design, { forCanvas: true }));
  }, [block, settings, imageMissing]);

  const issue = getBlockIssue(block);
  const issueText =
    issue === "text" ? t("issueText") : issue === "imageSrc" ? t("issueImageSrc") : issue === "href" ? t("issueHref") : null;
  const label = blockLabel(block.type);
  const excerpt = blockExcerpt(block);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(block.id);
    }
  };

  return (
    <div
      ref={setNodeRef}
      data-block-id={block.id}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined }}
      className={cn("group relative", isDragging && "opacity-60")}
    >
      {dropEdge === "before" && <span className="pointer-events-none absolute inset-x-0 -top-0.5 z-20 h-1 rounded bg-primary" aria-hidden />}
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={excerpt ? `${label}: ${excerpt}` : label}
        onClick={() => onSelect(block.id)}
        onKeyDown={handleKeyDown}
        className={cn(
          "relative block cursor-pointer outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-primary",
          selected
            ? "ring-2 ring-primary"
            : issueText
              ? "ring-1 ring-amber-500/80 hover:ring-2"
              : "hover:ring-1 hover:ring-primary/50"
        )}
      >
        {imageMissing ? (
          <div style={{ backgroundColor: block.backgroundColor, padding: `${block.padding}px` }}>
            <div className="flex flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-slate-300 bg-slate-50 px-3 py-8 text-center text-slate-500">
              <ImagePlus className="h-6 w-6" aria-hidden />
              <span className="text-xs">{t("issueImageSrc")}</span>
            </div>
          </div>
        ) : (
          <div
            inert
            dir={settings.direction}
            className="pointer-events-none select-none"
            dangerouslySetInnerHTML={{ __html: isClient ? html : "" }}
          />
        )}
      </div>

      {issueText && (
        <span
          className="pointer-events-none absolute left-2 top-0 z-10 flex max-w-[65%] -translate-y-1/2 items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 shadow-sm"
          role="note"
        >
          <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{issueText}</span>
        </span>
      )}

      <div
        dir="ltr"
        className={cn(
          "absolute right-2 top-0 z-10 flex -translate-y-1/2 items-center gap-0.5 rounded-md border bg-popover p-0.5 text-popover-foreground shadow-sm",
          selected || isDragging ? "visible" : "invisible group-focus-within:visible group-hover:visible"
        )}
      >
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t("dragHandle")}
          title={t("dragHandle")}
          className={cn(actionButtonClass, "cursor-grab touch-none active:cursor-grabbing")}
        >
          <GripVertical aria-hidden />
        </button>
        <button type="button" className={actionButtonClass} aria-label={t("moveUp")} title={t("moveUp")} disabled={isFirst} onClick={() => onMove(block.id, -1)}>
          <ArrowUp aria-hidden />
        </button>
        <button type="button" className={actionButtonClass} aria-label={t("moveDown")} title={t("moveDown")} disabled={isLast} onClick={() => onMove(block.id, 1)}>
          <ArrowDown aria-hidden />
        </button>
        <button
          type="button"
          className={actionButtonClass}
          aria-label={tc("duplicate")}
          title={tc("duplicate")}
          disabled={!canDuplicate}
          onClick={() => onDuplicate(block.id)}
        >
          <Copy aria-hidden />
        </button>
        <button
          type="button"
          className={cn(actionButtonClass, "hover:text-destructive")}
          aria-label={tc("delete")}
          title={tc("delete")}
          onClick={() => onRemove(block.id)}
        >
          <Trash2 aria-hidden />
        </button>
      </div>

      {dropEdge === "after" && <span className="pointer-events-none absolute inset-x-0 -bottom-0.5 z-20 h-1 rounded bg-primary" aria-hidden />}
    </div>
  );
});

function EmptyCanvas({ onStarter, highlighted }: { onStarter: (kind: EmailStarterKind) => void; highlighted: boolean }) {
  const t = useTranslations("emailVisualEditor");
  const starterClass =
    "inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40";
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed bg-white/85 px-4 py-12 text-center text-slate-600",
        highlighted ? "border-primary" : "border-slate-300"
      )}
    >
      <LayoutTemplate className="h-8 w-8 text-slate-400" aria-hidden />
      <p className="text-sm font-semibold text-slate-800">{t("emptyTitle")}</p>
      <p className="max-w-xs text-xs leading-relaxed">{t("emptyHint")}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className={starterClass} onClick={() => onStarter("welcome")}>
          <LayoutTemplate className="h-3.5 w-3.5" aria-hidden />
          {t("starterWelcome")}
        </button>
        <button type="button" className={starterClass} onClick={() => onStarter("news")}>
          <LayoutTemplate className="h-3.5 w-3.5" aria-hidden />
          {t("starterNews")}
        </button>
      </div>
    </div>
  );
}

/** O e-mail como será enviado (fundo externo + largura), sempre claro, com os blocos ordenáveis */
export function EditorCanvas({
  design,
  selectedId,
  dropTarget,
  paletteDragging,
  canAdd,
  onSelect,
  onClearSelection,
  onMove,
  onDuplicate,
  onRemove,
  onStarter,
}: EditorCanvasProps) {
  const { settings, blocks } = design;
  const { setNodeRef } = useDroppable({ id: CANVAS_DROP_ID, disabled: !paletteDragging });
  const ids = useMemo(() => blocks.map(block => block.id), [blocks]);
  const endHighlighted = dropTarget?.id === CANVAS_DROP_ID;

  const clearOnBackground = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClearSelection();
  };

  return (
    <div
      className="min-h-[320px] px-2 py-6 sm:px-4 lg:min-h-full"
      style={{ backgroundColor: settings.backgroundColor }}
      onClick={clearOnBackground}
    >
      <div
        ref={setNodeRef}
        className="relative mx-auto pb-10"
        style={{ width: `${settings.contentWidth}px`, maxWidth: "100%" }}
        onClick={clearOnBackground}
      >
        {blocks.length === 0 ? (
          <EmptyCanvas onStarter={onStarter} highlighted={endHighlighted} />
        ) : (
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col">
              {blocks.map((block, index) => (
                <CanvasBlock
                  key={block.id}
                  block={block}
                  settings={settings}
                  isFirst={index === 0}
                  isLast={index === blocks.length - 1}
                  selected={block.id === selectedId}
                  dropEdge={dropTarget && dropTarget.id === block.id ? (dropTarget.after ? "after" : "before") : null}
                  canDuplicate={canAdd}
                  onSelect={onSelect}
                  onMove={onMove}
                  onDuplicate={onDuplicate}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </SortableContext>
        )}
        {endHighlighted && blocks.length > 0 && (
          <span className="pointer-events-none absolute inset-x-0 bottom-8 h-1 rounded bg-primary" aria-hidden />
        )}
      </div>
    </div>
  );
}
