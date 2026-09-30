"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UnsavedChangesDialog } from "@/components/configuracoes/unsaved-changes-dialog";
import {
  MAX_DESIGN_BYTES,
  MAX_HTML_BYTES,
  countDesignIssues,
  createEmptyDesign,
  getDesignBytes,
  renderEmailHtml,
  utf8Bytes,
  type EmailDesign,
} from "@/lib/email-design";
import type { EmailEditorCapabilities } from "@/services/email-marketing";
import { VisualEmailEditor, type VisualEmailEditorStatus } from "./visual-email-editor";
import { isToastTarget } from "./editor-shared";

export interface VisualEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDesign: EmailDesign | null;
  capabilities: EmailEditorCapabilities | null;
  onApply: (design: EmailDesign, html: string) => void;
}

interface EditSession {
  /** Estado de partida — base do "tem alteração?" */
  baseline: EmailDesign;
  design: EmailDesign;
}

function startSession(initialDesign: EmailDesign | null): EditSession {
  const baseline = initialDesign ?? createEmptyDesign();
  return { baseline, design: baseline };
}

/**
 * Janela do editor visual (Envio em Massa e Campanhas): edita uma CÓPIA — "Aplicar"
 * devolve o design e o HTML; o modelo salvo não muda. Com alterações, fechar (Esc, clique
 * fora, X ou Cancelar) pede confirmação; Esc no meio de um arraste só cancela o arraste.
 */
export function VisualEmailDialog({ open, onOpenChange, initialDesign, capabilities, onApply }: VisualEmailDialogProps) {
  const t = useTranslations("emailVisualEditor");
  const tm = useTranslations("emailMarketingPage");
  const tc = useTranslations("common");
  const contentRef = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<EditSession | null>(() => (open ? startSession(initialDesign) : null));
  const [status, setStatus] = useState<VisualEmailEditorStatus | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);

  // Cada abertura começa do design recebido; o anterior fica até a animação de saída acabar
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setSession(startSession(initialDesign));
      setStatus(null);
      setConfirmOpen(false);
    }
  }

  const design = session?.design ?? null;

  const isDirty = (): boolean => {
    if (!session || session.design === session.baseline) return false;
    return JSON.stringify(session.design) !== JSON.stringify(session.baseline);
  };

  const isDragging = (): boolean => !!contentRef.current?.querySelector('[data-email-editor-dragging="true"]');

  const requestClose = () => {
    if (isDirty()) {
      setConfirmOpen(true);
      return;
    }
    onOpenChange(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    requestClose();
  };

  const discard = () => {
    setConfirmOpen(false);
    onOpenChange(false);
  };

  const handleDesignChange = (next: EmailDesign) => {
    setSession(current => (current ? { ...current, design: next } : current));
  };

  const issues = design ? countDesignIssues(design) : 0;
  const sizeExceeded = !!status && status.bytes > Math.min(MAX_HTML_BYTES, MAX_DESIGN_BYTES);
  const canApply = !!design && design.blocks.length > 0 && issues === 0 && !sizeExceeded;

  const handleApply = () => {
    if (!design || !design.blocks.length) return;
    // Revalida na hora: o status do editor é adiado e pode estar um quadro atrás
    const pending = countDesignIssues(design);
    if (pending > 0) {
      toast.error(t("issuesSummary", { count: pending }));
      return;
    }
    const html = renderEmailHtml(design);
    if (utf8Bytes(html) > MAX_HTML_BYTES || getDesignBytes(design) > MAX_DESIGN_BYTES) {
      toast.error(t("tooLarge"));
      return;
    }
    onApply(design, html);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        ref={contentRef}
        aria-describedby={undefined}
        className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[92dvh] sm:max-h-[92dvh] sm:w-[calc(100vw-1rem)] sm:max-w-[1400px] sm:rounded-xl"
        onEscapeKeyDown={event => {
          if (isDragging()) {
            event.preventDefault();
            return;
          }
          if (isDirty()) {
            event.preventDefault();
            setConfirmOpen(true);
          }
        }}
        onInteractOutside={event => {
          if (isToastTarget(event.target) || isDragging()) {
            event.preventDefault();
            return;
          }
          if (isDirty()) {
            event.preventDefault();
            setConfirmOpen(true);
          }
        }}
      >
        <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12 text-left sm:px-5">
          <DialogTitle className="text-base">{t("modeVisual")}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:overflow-hidden">
          {design && (
            <VisualEmailEditor
              value={design}
              onChange={handleDesignChange}
              capabilities={capabilities}
              onStatusChange={setStatus}
              className="lg:h-full lg:min-h-0"
            />
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-xs text-muted-foreground">{t("copyNote")}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={requestClose}>
              {tc("cancel")}
            </Button>
            <Button type="button" onClick={handleApply} disabled={!canApply}>
              {tm("editorApply")}
            </Button>
          </div>
        </div>

        <UnsavedChangesDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          onDiscard={discard}
          labels={{
            title: tm("unsavedTitle"),
            message: tm("unsavedDesc"),
            stay: tm("keepEditing"),
            discard: tm("discardChanges"),
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
