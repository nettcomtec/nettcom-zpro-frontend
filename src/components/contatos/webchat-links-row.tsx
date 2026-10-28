"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Globe, Info, Link2Off, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { deleteContactWebchatLinks, getContactWebchatLinks } from "@/services/contacts";
import { getBackendErrorCode } from "@/lib/backend-error-code";
import { cn } from "@/lib/utils";

// Navegadores do WebChat ligados ao contato pelo link de convite (PLANO_WEBCHAT_LINK_CONVITE
// D16/D21). Mostra quantos estão ligados e o "Desligar", que tira todos e invalida os links já
// enviados e ainda não abertos. Sem navegador ligado — ou com backend sem a rota — não aparece
// nada. O botão segue as travas do convite do Telegram: some para usuário restrito e para quem
// não pode editar contato (o backend confere de novo).

interface WebchatLinksRowProps {
  contactId: number | string | null | undefined;
  /** `!isRestrictedUser() && hasPermission("contacts_edit")` de quem monta. */
  canUnlink: boolean;
  className?: string;
}

export function WebchatLinksRow({ contactId, canUnlink, className }: WebchatLinksRowProps) {
  const t = useTranslations("webchatLinks");
  const tCommon = useTranslations("common");
  const tRegion = useTranslations("regionSettings");
  const [count, setCount] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const seqRef = useRef(0);

  const numericId = Number(contactId);
  const validId = Number.isSafeInteger(numericId) && numericId > 0 ? numericId : null;

  useEffect(() => {
    const seq = ++seqRef.current;
    setCount(0);
    setConfirmOpen(false);
    if (!validId) return;
    getContactWebchatLinks(validId).then((res) => {
      if (seq === seqRef.current) setCount(res.count);
    });
  }, [validId]);

  if (!validId || count <= 0) return null;

  const handleUnlink = async () => {
    if (removing) return;
    const seq = seqRef.current;
    setRemoving(true);
    try {
      await deleteContactWebchatLinks(validId);
      if (seq !== seqRef.current) return;
      setCount(0);
      setConfirmOpen(false);
      toast.success(t("unlinked"));
    } catch (err) {
      // "Sem permissão" já tem o aviso global do painel.
      if (getBackendErrorCode(err) !== "ERR_NO_PERMISSION") toast.error(t("error"));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <div className={cn("flex items-start gap-2 py-2 text-left", className)}>
        <Globe className="mt-[3px] h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase leading-none tracking-wide text-muted-foreground">
            <span className="min-w-0 truncate">{t("title")}</span>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={tRegion("moreInfo")}
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full normal-case opacity-80 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <Info className="h-3 w-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-72 max-w-[calc(100vw-2rem)] p-3 text-xs normal-case leading-relaxed text-muted-foreground"
              >
                {t("tooltip")}
              </PopoverContent>
            </Popover>
          </div>
          <div className="text-sm leading-snug break-words">{t("count", { count })}</div>
        </div>
        {canUnlink && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 gap-1 px-2 text-xs"
            onClick={() => setConfirmOpen(true)}
            disabled={removing}
          >
            <Link2Off className="h-3.5 w-3.5" />
            {t("unlink")}
          </Button>
        )}
      </div>

      {canUnlink && (
        <AlertDialog open={confirmOpen} onOpenChange={(open) => { if (!removing) setConfirmOpen(open); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("confirmText")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={removing}>{tCommon("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                disabled={removing}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={(e) => {
                  // Fecha só depois da resposta (falha mantém o diálogo para tentar de novo).
                  e.preventDefault();
                  void handleUnlink();
                }}
              >
                {removing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("confirmAction")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
