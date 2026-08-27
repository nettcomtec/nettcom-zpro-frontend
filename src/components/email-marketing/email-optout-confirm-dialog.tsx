"use client";

import { useTranslations } from "next-intl";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useEmailOptOutConfirmStore } from "@/stores/email-optout-confirm-store";

/** Dialog global do aviso de descadastro no envio manual (PLANO_EMAIL_MASSA D6) */
export function EmailOptOutConfirmDialog() {
  const t = useTranslations("emailOptOutDialog");
  const { open, optOutDate, resolve } = useEmailOptOutConfirmStore();

  const dateLabel = optOutDate ? new Date(optOutDate).toLocaleDateString() : "—";

  return (
    <AlertDialog open={open} onOpenChange={o => { if (!o) resolve(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("desc", { date: dateLabel })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => resolve(false)}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => resolve(true)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t("sendAnyway")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
