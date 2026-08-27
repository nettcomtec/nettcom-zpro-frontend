"use client";

/**
 * SipConsultPanel — fase de consulta da Transferência Consulta (attended).
 * A 1ª chamada está em espera; estamos falando com o ramal de destino.
 * Concluir → REFER/Replaces (conecta os dois e nos desconecta).
 * Cancelar → derruba a 2ª perna e retoma a chamada original.
 * A lógica de sessão vive no AsteriskWebphone; aqui só UI + confirmação.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Check, Loader2, PhoneForwarded, X } from "lucide-react";
import { useTranslations } from "next-intl";

interface SipConsultPanelProps {
  /** Contato original (em espera). */
  contactLabel: string;
  /** Ramal/atendente de destino com quem estamos consultando. */
  targetLabel: string;
  /** "calling" enquanto o destino não atende; "established" quando atende. */
  state: "calling" | "established";
  /** True enquanto o REFER de conclusão está em curso. */
  pending: boolean;
  onComplete: () => void;
  onCancel: () => void;
}

export function SipConsultPanel({
  contactLabel,
  targetLabel,
  state,
  pending,
  onComplete,
  onCancel,
}: SipConsultPanelProps) {
  const t = useTranslations("webphoneControls");
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="w-full rounded-lg border border-warning/40 bg-warning/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <PhoneForwarded aria-hidden="true" className="h-4 w-4 text-warning" />
        {t("consultTitle")}
      </div>

      <p className="mb-3 text-center text-sm">
        {state === "calling"
          ? t("consultCalling", { target: targetLabel })
          : t("consultTalking", { target: targetLabel })}
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          className="flex-1 gap-2"
          onClick={onCancel}
          disabled={pending}
        >
          <X className="h-4 w-4" />
          {t("consultCancel")}
        </Button>
        <Button
          className="flex-1 gap-2"
          onClick={() => setConfirmOpen(true)}
          disabled={state !== "established" || pending}
        >
          <Check className="h-4 w-4" />
          {t("consultComplete")}
        </Button>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => {
          if (!pending) setConfirmOpen(o);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("consultConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("consultConfirmText", { contact: contactLabel, target: targetLabel })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={pending}>
              {t("transferCancel")}
            </Button>
            <Button onClick={onComplete} disabled={pending}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("consultConfirmButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
