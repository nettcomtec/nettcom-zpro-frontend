"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { fetchWhatsapps, type Whatsapp } from "@/services/whatsapp";
import { filterWhatsappsForCurrentUser } from "@/lib/whatsapp-user-access";
import { readApiError, testSendEmailTemplate } from "@/services/email-marketing";

const EMAIL_CHANNEL_TYPES = ["email", "webmail"];

/** Data do descadastro no corpo do 409 — status/corpo chegam na RAIZ (lib/api.ts) */
function readOptOutDate(err: unknown): string {
  const e = err as {
    data?: { optOut?: { createdAt?: string } };
    response?: { data?: { optOut?: { createdAt?: string } } };
  } | null;
  return e?.data?.optOut?.createdAt ?? e?.response?.data?.optOut?.createdAt ?? "";
}

export interface EmailTemplateTestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Modelo JÁ salvo — o teste usa o que está gravado no servidor */
  templateId: number | null;
}

/**
 * Envio de teste de um modelo de e-mail (lista de modelos e página do modelo).
 * O 409 ERR_EMAIL_OPTOUT mostra o aviso de descadastro com "Enviar mesmo assim"
 * (allowOptOutOverride) — antes a leitura do erro olhava `err.response`, que o
 * `lib/api.ts` nunca preenche, e o aviso nunca aparecia.
 */
export function EmailTemplateTestDialog({ open, onOpenChange, templateId }: EmailTemplateTestDialogProps) {
  const t = useTranslations("emailMarketingPage");
  const [channels, setChannels] = useState<Whatsapp[]>([]);
  const [channelsLoaded, setChannelsLoaded] = useState(false);
  const [channelId, setChannelId] = useState("");
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const [optOutConfirm, setOptOutConfirm] = useState<string | null>(null);

  // Canais de e-mail do usuário (mesmo filtro da lista): carregados na 1ª abertura
  useEffect(() => {
    if (!open || channelsLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWhatsapps();
        const raw: Whatsapp[] = Array.isArray(res.data) ? res.data : [];
        const all = filterWhatsappsForCurrentUser(raw);
        if (!cancelled) {
          setChannels(all.filter(w => EMAIL_CHANNEL_TYPES.includes((w.type || "").toLowerCase())));
        }
      } catch {
        /* canais indisponíveis: o teste fica desabilitado */
      } finally {
        if (!cancelled) setChannelsLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [open, channelsLoaded]);

  useEffect(() => {
    if (!channelId && channels.length > 0) setChannelId(String(channels[0].id));
  }, [channels, channelId]);

  // Cada abertura começa sem a confirmação de descadastro anterior
  useEffect(() => {
    if (open) setOptOutConfirm(null);
  }, [open]);

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) setOptOutConfirm(null);
  };

  const handleSend = async (override = false) => {
    if (!templateId || !channelId || !to.trim()) return;
    setSending(true);
    try {
      await testSendEmailTemplate(templateId, {
        whatsappId: Number(channelId),
        to: to.trim(),
        ...(override ? { allowOptOutOverride: true } : {}),
      });
      toast.success(t("testSent"));
      setOptOutConfirm(null);
      onOpenChange(false);
    } catch (err: unknown) {
      const { status, code } = readApiError(err);
      if (status === 409 && code === "ERR_EMAIL_OPTOUT") {
        setOptOutConfirm(readOptOutDate(err));
      } else {
        toast.error(t("saveError"));
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>{t("testSendTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("testChannel")}</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger>
                <SelectValue placeholder={t("testChannel")} />
              </SelectTrigger>
              <SelectContent>
                {channels.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!channelsLoaded ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : channels.length === 0 ? (
              <p className="text-xs text-destructive">{t("noChannels")}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>{t("testTo")}</Label>
            <Input
              type="email"
              value={to}
              onChange={e => {
                setTo(e.target.value);
                // Trocou o destinatário: a confirmação de opt-out anterior não
                // vale para o novo endereço (auditoria pós-impl. #7)
                setOptOutConfirm(null);
              }}
              placeholder="nome@dominio.com"
            />
          </div>
          <p className="text-xs text-muted-foreground">{t("testHint")}</p>
          {optOutConfirm !== null && (
            <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
              <p>{t("optOutWarnDesc", { date: optOutConfirm ? new Date(optOutConfirm).toLocaleDateString() : "—" })}</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>{t("cancel")}</Button>
          {optOutConfirm !== null ? (
            <Button variant="destructive" disabled={sending} onClick={() => handleSend(true)} className="gap-1.5">
              {sending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("optOutSendAnyway")}
            </Button>
          ) : (
            <Button
              disabled={sending || !templateId || !channelId || !to.trim()}
              onClick={() => handleSend(false)}
              className="gap-1.5"
            >
              {sending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("testSendAction")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
