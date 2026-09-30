"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { LayoutTemplate } from "lucide-react";
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
import { EmailHtmlEditor } from "@/components/email-marketing/email-html-editor";
import { createEmptyDesign, type EmailDesign } from "@/lib/email-design";
import type { EmailEditorCapabilities } from "@/services/email-marketing";
import type { VisualEmailDialogProps } from "./visual/visual-email-dialog";

// Editor visual sob demanda: só baixa quando alguém abre a janela
const VisualEmailDialog = dynamic<VisualEmailDialogProps>(
  () => import("./visual/visual-email-dialog").then(mod => mod.VisualEmailDialog),
  { ssr: false }
);

export interface EmailBodyFieldSeed {
  design: EmailDesign | null;
  /** Muda a cada semeadura (escolher o mesmo modelo de novo re-semeia) */
  nonce: number;
}

export interface EmailBodyFieldProps {
  value: string;
  onChange: (html: string) => void;
  seed?: EmailBodyFieldSeed;
  capabilities: EmailEditorCapabilities | null;
}

/** Projeto visual casado com o HTML que ele gerou (ou com o HTML do modelo semeado) */
interface DesignLink {
  design: EmailDesign;
  html: string;
}

/** HTML sem texto nem imagem/tabela/linha (ex.: "<p></p>" do editor vazio) não é conteúdo */
function hasMeaningfulHtml(html: string): boolean {
  const source = String(html || "");
  if (/<(?:img|table|hr)\b/i.test(source)) return true;
  return source.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim().length > 0;
}

/**
 * Corpo do e-mail no Envio em Massa e nas Campanhas (D3/D6): editor clássico inline +
 * botão para o editor visual numa janela, editando uma cópia. O design só vale enquanto o
 * HTML for exatamente o que ele gerou (ou o do modelo semeado junto com ele) — editar o
 * HTML no clássico desliga os blocos, e reabrir o visual pede para substituir o conteúdo.
 * O pai deve atualizar `value` e `seed` no mesmo render (mesmo handler).
 */
export function EmailBodyField({ value, onChange, seed, capabilities }: EmailBodyFieldProps) {
  const t = useTranslations("emailVisualEditor");
  const tc = useTranslations("common");
  const [link, setLink] = useState<DesignLink | null>(() => (seed?.design ? { design: seed.design, html: value } : null));
  const [seedNonce, setSeedNonce] = useState<number | undefined>(seed?.nonce);
  const [dialogMounted, setDialogMounted] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDesign, setDialogDesign] = useState<EmailDesign | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (seed && seed.nonce !== seedNonce) {
    setSeedNonce(seed.nonce);
    setLink(seed.design ? { design: seed.design, html: value } : null);
  }

  const attachedDesign = link && link.html === value ? link.design : null;
  const canUseVisual = capabilities?.design === true;

  const openDialog = (design: EmailDesign | null) => {
    setDialogDesign(design);
    setDialogMounted(true);
    setDialogOpen(true);
  };

  const handleOpenVisual = () => {
    if (attachedDesign) {
      openDialog(attachedDesign);
      return;
    }
    if (hasMeaningfulHtml(value)) {
      setConfirmOpen(true);
      return;
    }
    openDialog(createEmptyDesign());
  };

  const handleApply = (design: EmailDesign, html: string) => {
    setLink({ design, html });
    onChange(html);
  };

  return (
    <div className="space-y-2">
      {canUseVisual && (
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={handleOpenVisual}>
            <LayoutTemplate className="h-3.5 w-3.5" aria-hidden />
            {t("openVisual")}
          </Button>
        </div>
      )}

      <EmailHtmlEditor value={value} onChange={onChange} />

      {canUseVisual && dialogMounted && (
        <VisualEmailDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          initialDesign={dialogDesign}
          capabilities={capabilities}
          onApply={handleApply}
        />
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("replaceTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("replaceDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                openDialog(createEmptyDesign());
              }}
            >
              {t("replaceConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
