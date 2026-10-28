"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Link2, Loader2, MessageSquareShare } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fetchWebchatInviteMessage, type WebchatInviteMessage } from "@/services/webchat";

// Mesmas grafias que o servidor troca pelo link ({{linkWebchat}} e {linkWebchat}).
const INVITE_VAR_RE = /(\{\{linkWebchat\}\}|\{linkWebchat\})/;

/**
 * Confirmação do "Enviar convite do WebChat" (menu ⋮ da caixa de mensagem e botão do
 * cabeçalho do atendimento oficial). Relê o texto no servidor ao abrir (texto da empresa
 * ou o padrão no idioma dela) e entrega a quem chamou, que envia pelo mesmo caminho do
 * texto digitado — o link é gerado no servidor, no envio; aqui ele aparece só como selo.
 */
export function WebchatInviteSendDialog({
  open,
  onOpenChange,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (text: string) => void | Promise<void>;
}) {
  const t = useTranslations("webchatPage.inviteSend");
  // undefined = carregando; null = indisponível (servidor antigo ou falha).
  const [info, setInfo] = React.useState<WebchatInviteMessage | null | undefined>(undefined);

  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    setInfo(undefined);
    fetchWebchatInviteMessage({ fresh: true })
      .then((value) => {
        if (alive) setInfo(value);
      })
      .catch(() => {
        if (alive) setInfo(null);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  const ready = !!info && info.ready && info.text.trim().length > 0;

  const handleSend = () => {
    if (!ready || !info) return;
    // A bolha aparece na hora (envio otimista); erro de envio é tratado por quem envia.
    void Promise.resolve(onSend(info.text)).catch(() => undefined);
    onOpenChange(false);
  };

  const parts = ready && info ? info.text.split(INVITE_VAR_RE) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareShare className="h-5 w-5 shrink-0" /> {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {info === undefined ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("loading")}
            </div>
          ) : !ready ? (
            <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">{t("unavailable")}</p>
          ) : (
            <>
              <div className="rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-wrap break-words">
                {parts.map((part, i) =>
                  INVITE_VAR_RE.test(part) ? (
                    <span
                      key={i}
                      className="mx-0.5 inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary align-middle"
                    >
                      <Link2 className="h-3 w-3" /> {t("linkChip")}
                    </span>
                  ) : (
                    <React.Fragment key={i}>{part}</React.Fragment>
                  )
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t("textSource")}</p>
              <div className="space-y-1.5 rounded-md border p-3">
                <p className="text-xs font-medium">{t("alertsTitle")}</p>
                <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                  <li>{t("alertCost")}</li>
                  <li>{t("alertSingleUse")}</li>
                  <li>{t("alertTicketOpen")}</li>
                  <li>{t("alertNoNotify")}</li>
                </ul>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
          <Button onClick={handleSend} disabled={!ready}>
            <MessageSquareShare className="mr-2 h-4 w-4" /> {t("send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
