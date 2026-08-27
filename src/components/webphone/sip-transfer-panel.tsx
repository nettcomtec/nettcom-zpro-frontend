"use client";

/**
 * SipTransferPanel — painel "Painel Operacional" de transferência de chamada SIP.
 * PR2: Transferência Direta (blind / REFER). A lógica do REFER vive no
 * AsteriskWebphone (onde estão a sessão e o endCall); aqui só montamos o alvo
 * (número livre ou ramal de um atendente) e confirmamos antes de transferir.
 */

import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ArrowRight, ChevronLeft, Loader2, PhoneForwarded, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { getSipTransferTargets, type SipTransferTarget } from "@/services/sip";
import { cn } from "@/lib/utils";

interface SipTransferPanelProps {
  /** Rótulo do contato em chamada (nome ou número) — usado no texto de confirmação. */
  contactLabel: string;
  /** True enquanto o REFER está em curso — desabilita os controles. */
  transferPending: boolean;
  /** Executa a transferência direta (REFER) para o ramal/numero informado. */
  onConfirmTransfer: (ext: string, label: string) => void;
  /** Inicia a transferência consultiva (segura a chamada e liga ao destino). */
  onStartConsultation: (ext: string, label: string) => void;
  /** Fecha o painel e volta aos controles. */
  onClose: () => void;
}

export function SipTransferPanel({
  contactLabel,
  transferPending,
  onConfirmTransfer,
  onStartConsultation,
  onClose,
}: SipTransferPanelProps) {
  const t = useTranslations("webphoneControls");
  const [agents, setAgents] = useState<SipTransferTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [number, setNumber] = useState("");
  const [selected, setSelected] = useState<SipTransferTarget | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let active = true;
    getSipTransferTargets()
      .then((res) => {
        if (active) setAgents(res.data ?? []);
      })
      .catch(() => {
        if (active) setAgents([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const pickAgent = useCallback((a: SipTransferTarget) => {
    setSelected(a);
    setNumber(a.sipUsername);
  }, []);

  const onNumberChange = useCallback((v: string) => {
    setNumber(v);
    setSelected(null);
  }, []);

  const targetExt = number.trim();
  const targetLabel = selected
    ? `${selected.name} (${t("agentExtension", { ext: selected.sipUsername })})`
    : targetExt;

  const confirm = useCallback(() => {
    if (!targetExt) return;
    onConfirmTransfer(targetExt, targetLabel);
  }, [onConfirmTransfer, targetExt, targetLabel]);

  return (
    <div className="w-full rounded-lg border bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {t("transferBack")}
        </button>
        <span className="text-sm font-semibold">{t("transferTitle")}</span>
      </div>

      <Input
        value={number}
        onChange={(e) => onNumberChange(e.target.value)}
        placeholder={t("transferNumberPlaceholder")}
        className="mb-2 text-center"
      />

      <div className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        {t("transferAgents")}
      </div>

      <div className="mb-3 max-h-40 overflow-y-auto rounded-md border bg-background">
        {loading ? (
          <div className="flex items-center justify-center p-3 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : agents.length === 0 ? (
          <p className="p-3 text-center text-xs text-muted-foreground">
            {t("transferNoAgents")}
          </p>
        ) : (
          agents.map((a) => (
            <button
              key={a.userId}
              type="button"
              onClick={() => pickAgent(a)}
              className={cn(
                "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                selected?.userId === a.userId && "bg-primary/10"
              )}
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-2 w-2 rounded-full",
                    a.isOnline ? "bg-success" : "bg-muted-foreground/40"
                  )}
                />
                <span className="font-medium">{a.name}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {t("agentExtension", { ext: a.sipUsername })}
              </span>
            </button>
          ))
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          className="flex-1 gap-2"
          disabled={!targetExt || transferPending}
          onClick={() => onStartConsultation(targetExt, targetLabel)}
        >
          <PhoneForwarded className="h-4 w-4" />
          {t("transferAttended")}
        </Button>
        <Button
          className="flex-1 gap-2"
          disabled={!targetExt || transferPending}
          onClick={() => setConfirmOpen(true)}
        >
          <ArrowRight className="h-4 w-4" />
          {t("transferDirect")}
        </Button>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => {
          if (!transferPending) setConfirmOpen(o);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("transferConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("transferConfirmDirect", { contact: contactLabel, target: targetLabel })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={transferPending}
            >
              {t("transferCancel")}
            </Button>
            <Button onClick={confirm} disabled={transferPending}>
              {transferPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("transferConfirmButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
