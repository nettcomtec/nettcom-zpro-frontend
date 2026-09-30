"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { AlertTriangle, Download, Eye, Monitor, Pencil, Redo2, Smartphone, Undo2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  GMAIL_CLIP_WARN_BYTES,
  MAX_BLOCKS,
  MAX_DESIGN_BYTES,
  MAX_DESIGN_FILE_BYTES,
  MAX_HTML_BYTES,
  MOBILE_PREVIEW_WIDTH,
  buildStarterDesign,
  countDesignIssues,
  createBlock,
  duplicateBlock,
  getDesignBytes,
  insertBlock,
  moveBlock,
  parseDesignFile,
  removeBlock,
  renderEmailHtml,
  serializeDesignFile,
  updateBlock,
  utf8Bytes,
  type EmailBlock,
  type EmailBlockType,
  type EmailDesign,
  type EmailDesignSettings,
  type EmailStarterKind,
} from "@/lib/email-design";
import type { EmailEditorCapabilities } from "@/services/email-marketing";
import { EditorBlockPalette, PaletteDragPreview } from "./editor-block-palette";
import { EditorBlockProperties } from "./editor-block-properties";
import { EditorCanvas, type CanvasDropTarget } from "./editor-canvas";
import { EditorStylePanel } from "./editor-style-panel";
import { EmailPreviewFrame } from "./email-preview-frame";
import {
  CANVAS_DROP_ID,
  DESKTOP_QUERY,
  HISTORY_GROUP_MS,
  HISTORY_LIMIT,
  designFileSlug,
  downloadTextFile,
  isEditableTarget,
  readFileText,
  useIsClient,
  useLatest,
  useMediaQuery,
  type PaletteDragData,
} from "./editor-shared";

export interface VisualEmailEditorStatus {
  issues: number;
  /** Maior entre o HTML e o projeto, em bytes UTF-8 (os dois têm o mesmo teto de 900 KB) */
  bytes: number;
}

export interface VisualEmailEditorProps {
  value: EmailDesign;
  onChange: (next: EmailDesign) => void;
  capabilities: EmailEditorCapabilities | null;
  onStatusChange?: (status: VisualEmailEditorStatus) => void;
  className?: string;
}

interface HistoryState {
  past: EmailDesign[];
  future: EmailDesign[];
}

type ActiveDrag = { from: "palette"; type: EmailBlockType } | { from: "canvas"; id: string };

const dragSource = (data: unknown): PaletteDragData | null => {
  const value = data as PaletteDragData | undefined;
  return value?.from === "palette" ? value : null;
};

/**
 * Editor visual por blocos (PLANO_EMAIL_EDITOR_VISUAL §5 Passo 3). Controlado por
 * `value`/`onChange`; o histórico de desfazer é interno e zera quando o pai troca o
 * documento (valor que não veio deste editor).
 */
export function VisualEmailEditor({ value, onChange, onStatusChange, className }: VisualEmailEditorProps) {
  const t = useTranslations("emailVisualEditor");
  const tm = useTranslations("emailMarketingPage");
  const tc = useTranslations("common");
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const isClient = useIsClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");
  const [sideTab, setSideTab] = useState<"block" | "style">("block");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingReplace, setPendingReplace] = useState<EmailDesign | null>(null);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [dropTarget, setDropTarget] = useState<CanvasDropTarget | null>(null);
  const [historyCounts, setHistoryCounts] = useState({ past: 0, future: 0 });

  const rootRef = useRef<HTMLDivElement>(null);
  const sheetContentRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const valueRef = useLatest(value);
  const onChangeRef = useLatest(onChange);
  const onStatusRef = useLatest(onStatusChange);
  const selectedIdRef = useLatest(selectedId);
  const isDesktopRef = useLatest(isDesktop);
  const tRef = useLatest(t);
  const historyRef = useRef<HistoryState>({ past: [], future: [] });
  const groupRef = useRef<{ key: string | null; at: number }>({ key: null, at: 0 });
  const lastEmittedRef = useRef<EmailDesign | null>(null);
  const pendingScrollRef = useRef<string | null>(null);
  const dropTargetRef = useRef<CanvasDropTarget | null>(null);

  // ── Histórico ─────────────────────────────────────────────────────────────

  const setHistory = useCallback((next: HistoryState) => {
    historyRef.current = next;
    setHistoryCounts(prev =>
      prev.past === next.past.length && prev.future === next.future.length
        ? prev
        : { past: next.past.length, future: next.future.length }
    );
  }, []);

  const emit = useCallback(
    (next: EmailDesign) => {
      lastEmittedRef.current = next;
      valueRef.current = next;
      onChangeRef.current(next);
    },
    [onChangeRef, valueRef]
  );

  /** Aplica uma mudança; `group` junta digitação no mesmo campo em um só passo (750 ms) */
  const commit = useCallback(
    (next: EmailDesign, group?: string) => {
      const current = valueRef.current;
      if (next === current) return;
      const now = Date.now();
      const last = groupRef.current;
      const merge = !!group && last.key === group && now - last.at < HISTORY_GROUP_MS;
      groupRef.current = { key: group ?? null, at: now };
      const history = historyRef.current;
      setHistory(
        merge
          ? { past: history.past, future: [] }
          : { past: [...history.past, current].slice(-HISTORY_LIMIT), future: [] }
      );
      emit(next);
    },
    [emit, setHistory, valueRef]
  );

  const undo = useCallback(() => {
    const history = historyRef.current;
    if (!history.past.length) return;
    const previous = history.past[history.past.length - 1];
    groupRef.current = { key: null, at: 0 };
    setHistory({
      past: history.past.slice(0, -1),
      future: [valueRef.current, ...history.future].slice(0, HISTORY_LIMIT),
    });
    emit(previous);
  }, [emit, setHistory, valueRef]);

  const redo = useCallback(() => {
    const history = historyRef.current;
    if (!history.future.length) return;
    const [next, ...rest] = history.future;
    groupRef.current = { key: null, at: 0 };
    setHistory({ past: [...history.past, valueRef.current].slice(-HISTORY_LIMIT), future: rest });
    emit(next);
  }, [emit, setHistory, valueRef]);

  // Documento trocado pelo pai (abrir modelo, restaurar rascunho): histórico zera. O host
  // das imagens do servidor NÃO é trocado aqui — o front não sabe se a imagem é desta
  // instalação (projeto importado de outra ficaria quebrado); o envio reescreve só as
  // imagens com assinatura válida nesta instalação (RenderEmailForRecipientService).
  useEffect(() => {
    if (value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
    groupRef.current = { key: null, at: 0 };
    setHistory({ past: [], future: [] });
  }, [value, setHistory]);

  // ── Operações de bloco (callbacks estáveis: o memo dos blocos do canvas depende disso) ──

  const selectBlock = useCallback(
    (id: string, options?: { openSheet?: boolean; scroll?: boolean }) => {
      setSelectedId(id);
      setSideTab("block");
      if (options?.openSheet && !isDesktopRef.current) setSheetOpen(true);
      if (options?.scroll) pendingScrollRef.current = id;
    },
    [isDesktopRef]
  );

  const selectFromCanvas = useCallback((id: string) => selectBlock(id, { openSheet: true }), [selectBlock]);

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setSheetOpen(false);
  }, []);

  const addBlock = useCallback(
    (type: EmailBlockType, atIndex?: number) => {
      const current = valueRef.current;
      const translate = tRef.current;
      if (current.blocks.length >= MAX_BLOCKS) {
        toast.error(translate("limitBlocks"));
        return;
      }
      const block = createBlock(type, {
        heading: translate("newHeading"),
        text: translate("newText"),
        button: translate("sampleButton"),
      });
      const selectedIndex = current.blocks.findIndex(item => item.id === selectedIdRef.current);
      const index = atIndex ?? (selectedIndex >= 0 ? selectedIndex + 1 : current.blocks.length);
      commit(insertBlock(current, block, index));
      selectBlock(block.id, { scroll: true });
    },
    [commit, selectBlock, selectedIdRef, tRef, valueRef]
  );

  const patchBlock = useCallback(
    (id: string, patch: Partial<EmailBlock>, group?: string) => {
      const current = valueRef.current;
      if (!current.blocks.some(block => block.id === id)) return;
      commit(updateBlock(current, id, patch), group ? `${id}:${group}` : undefined);
    },
    [commit, valueRef]
  );

  const moveBy = useCallback(
    (id: string, delta: -1 | 1) => {
      const current = valueRef.current;
      const from = current.blocks.findIndex(block => block.id === id);
      if (from < 0) return;
      commit(moveBlock(current, from, from + delta));
    },
    [commit, valueRef]
  );

  const duplicate = useCallback(
    (id: string) => {
      const current = valueRef.current;
      if (current.blocks.length >= MAX_BLOCKS) {
        toast.error(tRef.current("limitBlocks"));
        return;
      }
      const index = current.blocks.findIndex(block => block.id === id);
      if (index < 0) return;
      const next = duplicateBlock(current, id);
      if (next === current) return;
      commit(next);
      const copy = next.blocks[index + 1];
      if (copy) selectBlock(copy.id, { scroll: true });
    },
    [commit, selectBlock, tRef, valueRef]
  );

  const remove = useCallback(
    (id: string) => {
      const current = valueRef.current;
      if (!current.blocks.some(block => block.id === id)) return;
      commit(removeBlock(current, id));
      if (selectedIdRef.current === id) {
        setSelectedId(null);
        setSheetOpen(false);
      }
    },
    [commit, selectedIdRef, valueRef]
  );

  const patchSettings = useCallback(
    (patch: Partial<EmailDesignSettings>, group?: string) => {
      const current = valueRef.current;
      commit({ ...current, settings: { ...current.settings, ...patch } }, group ? `settings:${group}` : undefined);
    },
    [commit, valueRef]
  );

  /** Modelo pronto / projeto importado: com blocos na tela, confirma antes de substituir */
  const requestReplace = useCallback(
    (next: EmailDesign) => {
      if (valueRef.current.blocks.length > 0) {
        setPendingReplace(next);
        return;
      }
      commit(next);
      setSelectedId(null);
    },
    [commit, valueRef]
  );

  const applyStarter = useCallback(
    (kind: EmailStarterKind) => {
      const translate = tRef.current;
      // ICU: a mensagem usa {firstName}; o token {{firstName}} entra como valor
      const texts =
        kind === "news"
          ? {
              heading: translate("newsHeading"),
              text: translate("newsText", { firstName: "{{firstName}}" }),
              button: translate("sampleButton"),
            }
          : {
              heading: translate("sampleHeading"),
              text: translate("sampleText", { firstName: "{{firstName}}" }),
              button: translate("sampleButton"),
            };
      requestReplace(buildStarterDesign(kind, texts, valueRef.current.settings.direction));
    },
    [requestReplace, tRef, valueRef]
  );

  const confirmReplace = () => {
    const next = pendingReplace;
    setPendingReplace(null);
    if (!next) return;
    commit(next);
    setSelectedId(null);
    setSheetOpen(false);
  };

  // ── Exportar / importar projeto ───────────────────────────────────────────

  const handleExport = () => {
    const current = valueRef.current;
    if (!current.blocks.length) return;
    const heading = current.blocks.find(block => block.type === "heading");
    const name = designFileSlug(heading && heading.type === "heading" ? heading.text : "") || "email";
    downloadTextFile(`${name}.json`, serializeDesignFile(current));
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;
    input.value = "";
    if (!file) return;
    let parsed: EmailDesign | null = null;
    if (file.size <= MAX_DESIGN_FILE_BYTES) {
      try {
        parsed = parseDesignFile(await readFileText(file));
      } catch {
        parsed = null;
      }
    }
    if (!parsed) {
      toast.error(t("importError"));
      return;
    }
    requestReplace(parsed);
  };

  // ── Tamanho, pendências e prévia (adiados: não pesam a digitação) ─────────

  const deferredValue = useDeferredValue(value);
  const html = useMemo(() => renderEmailHtml(deferredValue), [deferredValue]);
  const htmlBytes = useMemo(() => utf8Bytes(html), [html]);
  const designBytes = useMemo(() => getDesignBytes(deferredValue), [deferredValue]);
  const issues = useMemo(() => countDesignIssues(deferredValue), [deferredValue]);
  const tooLarge = htmlBytes > MAX_HTML_BYTES || designBytes > MAX_DESIGN_BYTES;
  const clipWarning = !tooLarge && htmlBytes >= GMAIL_CLIP_WARN_BYTES;

  useEffect(() => {
    onStatusRef.current?.({ issues, bytes: Math.max(htmlBytes, designBytes) });
  }, [issues, htmlBytes, designBytes, onStatusRef]);

  // Bloco recém-criado/duplicado aparece na tela
  useEffect(() => {
    const id = pendingScrollRef.current;
    if (!id) return;
    pendingScrollRef.current = null;
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-block-id="${id}"]`);
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [value]);

  // ── Arrastar (reordenar no canvas e soltar blocos da paleta) ──────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const collisionDetection = useCallback<CollisionDetection>(args => {
    if (dragSource(args.active.data.current)) {
      const hits = pointerWithin(args);
      return hits.length ? hits : rectIntersection(args);
    }
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(container => container.id !== CANVAS_DROP_ID),
    });
  }, []);

  const resolveDrop = (event: DragMoveEvent | DragOverEvent | DragEndEvent): CanvasDropTarget | null => {
    const { over, active } = event;
    if (!over) return null;
    const overId = String(over.id);
    if (overId === CANVAS_DROP_ID) return { id: CANVAS_DROP_ID, after: true };
    const rect = active.rect.current.translated;
    if (!rect) return { id: overId, after: false };
    return { id: overId, after: rect.top + rect.height / 2 > over.rect.top + over.rect.height / 2 };
  };

  const resetDrag = () => {
    setActiveDrag(null);
    dropTargetRef.current = null;
    setDropTarget(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const source = dragSource(event.active.data.current);
    setActiveDrag(source ? { from: "palette", type: source.type } : { from: "canvas", id: String(event.active.id) });
  };

  const trackDropTarget = (event: DragMoveEvent | DragOverEvent) => {
    if (!dragSource(event.active.data.current)) return;
    const next = resolveDrop(event);
    const previous = dropTargetRef.current;
    if (previous?.id === next?.id && previous?.after === next?.after) return;
    dropTargetRef.current = next;
    setDropTarget(next);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const source = dragSource(event.active.data.current);
    const drop = source ? resolveDrop(event) : null;
    resetDrag();
    const current = valueRef.current;
    if (source) {
      if (!drop) return;
      if (drop.id === CANVAS_DROP_ID) {
        addBlock(source.type, current.blocks.length);
        return;
      }
      const index = current.blocks.findIndex(block => block.id === drop.id);
      if (index >= 0) addBlock(source.type, drop.after ? index + 1 : index);
      return;
    }
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = current.blocks.findIndex(block => block.id === active.id);
    const to = current.blocks.findIndex(block => block.id === over.id);
    if (from < 0 || to < 0) return;
    commit(moveBlock(current, from, to));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || isEditableTarget(event.target)) return;
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      undo();
    } else if ((key === "z" && event.shiftKey) || key === "y") {
      event.preventDefault();
      redo();
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const selectedIndex = selectedId ? value.blocks.findIndex(block => block.id === selectedId) : -1;
  const selectedBlock = selectedIndex >= 0 ? value.blocks[selectedIndex] : null;
  const canAdd = value.blocks.length < MAX_BLOCKS;
  const hasBlocks = value.blocks.length > 0;
  const sizeKb = Math.ceil(htmlBytes / 1024);

  const properties = selectedBlock ? (
    <EditorBlockProperties
      key={selectedBlock.id}
      block={selectedBlock}
      isFirst={selectedIndex === 0}
      isLast={selectedIndex === value.blocks.length - 1}
      canDuplicate={canAdd}
      onPatch={patchBlock}
      onMove={moveBy}
      onDuplicate={duplicate}
      onRemove={remove}
    />
  ) : null;

  const stylePanel = <EditorStylePanel settings={value.settings} onPatch={patchSettings} />;

  const toolbar = (
    <div className="flex shrink-0 flex-wrap items-center gap-1 rounded-lg border bg-card p-1.5">
      {mode === "edit" ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={tm("editorUndo")}
            title={tm("editorUndo")}
            disabled={historyCounts.past === 0}
            onClick={undo}
          >
            <Undo2 aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={tm("editorRedo")}
            title={tm("editorRedo")}
            disabled={historyCounts.future === 0}
            onClick={redo}
          >
            <Redo2 aria-hidden />
          </Button>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            aria-label={t("exportDesign")}
            title={t("exportDesign")}
            disabled={!hasBlocks}
            onClick={handleExport}
          >
            <Download aria-hidden />
            <span className="hidden sm:inline">{t("exportDesign")}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            aria-label={tc("import")}
            title={tc("import")}
            onClick={() => importInputRef.current?.click()}
          >
            <Upload aria-hidden />
            <span className="hidden sm:inline">{tc("import")}</span>
          </Button>
        </>
      ) : (
        <div role="group" className="flex items-center gap-0.5 rounded-md border p-0.5">
          <Button
            type="button"
            size="sm"
            variant={viewMode === "desktop" ? "secondary" : "ghost"}
            aria-pressed={viewMode === "desktop"}
            className="h-7 gap-1.5 px-2"
            onClick={() => setViewMode("desktop")}
          >
            <Monitor aria-hidden />
            {t("viewDesktop")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "mobile" ? "secondary" : "ghost"}
            aria-pressed={viewMode === "mobile"}
            className="h-7 gap-1.5 px-2"
            onClick={() => setViewMode("mobile")}
          >
            <Smartphone aria-hidden />
            {t("viewMobile")}
          </Button>
        </div>
      )}
      <div className="ml-auto flex items-center gap-2">
        <span
          className={cn(
            "whitespace-nowrap text-xs tabular-nums",
            tooLarge ? "font-medium text-destructive" : clipWarning ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground"
          )}
        >
          {t("sizeCounter", { size: sizeKb })}
        </span>
        {mode === "edit" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setSheetOpen(false);
              setMode("preview");
            }}
          >
            <Eye aria-hidden />
            {tm("preview")}
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setMode("edit")}>
            <Pencil aria-hidden />
            {t("backToEdit")}
          </Button>
        )}
      </div>
    </div>
  );

  const alerts: string[] = [];
  if (tooLarge) alerts.push(t("tooLarge"));
  else if (clipWarning) alerts.push(t("gmailClipWarning"));
  if (issues > 0) alerts.push(t("issuesSummary", { count: issues }));

  const editArea = (
    <div className="flex min-h-0 flex-1 flex-col gap-3 lg:grid lg:grid-cols-[12.5rem_minmax(0,1fr)_19rem]">
      <aside className="rounded-lg border bg-card p-2.5 lg:min-h-0 lg:overflow-y-auto lg:p-3">
        <EditorBlockPalette layout={isDesktop ? "column" : "strip"} canAdd={canAdd} onAdd={addBlock} onStarter={applyStarter} />
      </aside>
      <div className="relative min-h-[320px] overflow-hidden rounded-lg border lg:min-h-0">
        <div className="h-full overflow-y-auto">
          <EditorCanvas
            design={value}
            selectedId={selectedId}
            dropTarget={dropTarget}
            paletteDragging={activeDrag?.from === "palette"}
            canAdd={canAdd}
            onSelect={selectFromCanvas}
            onClearSelection={clearSelection}
            onMove={moveBy}
            onDuplicate={duplicate}
            onRemove={remove}
            onStarter={applyStarter}
          />
        </div>
      </div>
      {isDesktop ? (
        <aside className="flex flex-col rounded-lg border bg-card lg:min-h-0 lg:overflow-hidden">
          <div role="group" className="flex shrink-0 gap-1 border-b p-1.5">
            <Button
              type="button"
              size="sm"
              variant={sideTab === "block" ? "secondary" : "ghost"}
              aria-pressed={sideTab === "block"}
              className="h-auto min-h-8 flex-1 whitespace-normal px-2 py-1.5 text-xs"
              onClick={() => setSideTab("block")}
            >
              {t("blockSettings")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={sideTab === "style" ? "secondary" : "ghost"}
              aria-pressed={sideTab === "style"}
              className="h-auto min-h-8 flex-1 whitespace-normal px-2 py-1.5 text-xs"
              onClick={() => setSideTab("style")}
            >
              {t("emailStyle")}
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {sideTab === "style"
              ? stylePanel
              : properties ?? <p className="px-2 py-8 text-center text-sm text-muted-foreground">{t("selectBlockHint")}</p>}
          </div>
        </aside>
      ) : (
        <section className="rounded-lg border bg-card p-3">
          <p className="mb-3 text-sm font-semibold">{t("emailStyle")}</p>
          {stylePanel}
        </section>
      )}
    </div>
  );

  const previewArea = (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-muted/40 p-3 sm:p-4">
      {hasBlocks ? (
        <div className="space-y-3">
          <div className="overflow-x-auto">
            <EmailPreviewFrame
              html={html}
              width={viewMode === "mobile" ? MOBILE_PREVIEW_WIDTH : undefined}
              className="mx-auto rounded-md border shadow-sm"
            />
          </div>
          <p className="text-center text-xs text-muted-foreground">
            {t("previewVariablesNote", { example: "{{firstName}}" })}
          </p>
          <p className="text-center text-xs text-muted-foreground">{t("footerNote")}</p>
        </div>
      ) : (
        <p className="py-12 text-center text-sm text-muted-foreground">{t("emptyTitle")}</p>
      )}
    </div>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragMove={trackDropTarget}
        onDragOver={trackDropTarget}
        onDragEnd={handleDragEnd}
        onDragCancel={resetDrag}
      >
        <div
          ref={rootRef}
          data-email-editor=""
          data-email-editor-dragging={activeDrag ? "true" : undefined}
          onKeyDown={handleKeyDown}
          className={cn("flex min-h-0 flex-col gap-3 lg:h-[calc(100dvh-8rem)] lg:min-h-[560px]", className)}
        >
          {toolbar}

          {alerts.length > 0 && (
            <div className="shrink-0 space-y-1.5">
              {alerts.map(message => (
                <div
                  key={message}
                  role="status"
                  className={cn(
                    "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
                    tooLarge && message === alerts[0]
                      ? "border-destructive/40 bg-destructive/10 text-destructive"
                      : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
                  )}
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>{message}</span>
                </div>
              ))}
            </div>
          )}

          {mode === "preview" ? previewArea : editArea}

          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            tabIndex={-1}
            aria-hidden
            onChange={handleImportFile}
          />
        </div>

        {/* Só na paleta: com o overlay montado o bloco arrastado no canvas deixaria de
            acompanhar o ponteiro. Portal no body porque a janela tem transform (o fixed
            do overlay ficaria deslocado dentro dela). */}
        {isClient && activeDrag?.from === "palette" && typeof document !== "undefined"
          ? createPortal(
              <DragOverlay dropAnimation={null}>
                <PaletteDragPreview type={activeDrag.type} />
              </DragOverlay>,
              document.body
            )
          : null}
      </DndContext>

      {!isDesktop && (
        <Sheet open={sheetOpen && !!selectedBlock && mode === "edit"} onOpenChange={setSheetOpen}>
          <SheetContent
            ref={sheetContentRef}
            side="bottom"
            aria-describedby={undefined}
            className="max-h-[75dvh] overflow-y-auto rounded-t-xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            // Sem foco automático no 1º campo: no celular isso abriria o teclado por cima
            onOpenAutoFocus={event => {
              event.preventDefault();
              sheetContentRef.current?.focus();
            }}
          >
            <SheetHeader className="pr-8 text-left">
              <SheetTitle className="text-base">{t("blockSettings")}</SheetTitle>
            </SheetHeader>
            <div className="mt-3">{properties}</div>
          </SheetContent>
        </Sheet>
      )}

      <AlertDialog
        open={!!pendingReplace}
        onOpenChange={open => {
          if (!open) setPendingReplace(null);
        }}
      >
        <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("replaceTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("replaceDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmReplace}>{t("replaceConfirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
