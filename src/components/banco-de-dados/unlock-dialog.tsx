"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Clock, Lock } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isDbConsoleApiError, unlockDbConsole } from "@/services/db-console";

export type UnlockNotice = "expired" | "relogin" | null;

type UnlockFailure = "wrong" | "tooMany" | "relogin" | "generic" | null;

interface UnlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** sessão aberta por chave mestra: quem confirma é a chave, não a senha do usuário. */
  viaMasterKey: boolean;
  notice: UnlockNotice;
  onUnlocked: () => void;
  /** o console existe mas não pôde ser preparado (sem privilégio, pooler, conexão). */
  onUnavailable?: (reason: string) => void;
}

export function UnlockDialog({
  open,
  onOpenChange,
  viaMasterKey,
  notice,
  onUnlocked,
  onUnavailable
}: UnlockDialogProps) {
  const t = useTranslations("bancoDadosPage");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const [secret, setSecret] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<UnlockFailure>(null);

  useEffect(() => {
    if (!open) {
      setSecret("");
      setFailure(null);
    }
  }, [open]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!secret || submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      await unlockDbConsole(secret, viaMasterKey);
      setSecret("");
      onUnlocked();
    } catch (err) {
      // O valor digitado nunca fica guardado depois da tentativa.
      setSecret("");
      const code = isDbConsoleApiError(err) ? err.code : "";
      if (code === "ERR_DB_CONSOLE_WRONG_PASSWORD") setFailure("wrong");
      else if (code === "ERR_DB_CONSOLE_TOO_MANY_ATTEMPTS") setFailure("tooMany");
      else if (code === "ERR_DB_CONSOLE_RELOGIN") setFailure("relogin");
      else if (code === "ERR_DB_CONSOLE_DISABLED") onUnavailable?.("disabled");
      else if (code === "ERR_DB_CONSOLE_UNAVAILABLE") {
        // a senha estava certa: o console é que não pôde ser preparado. Sem levar o
        // motivo para a página, o diálogo ficaria aberto e mudo (caso do PgBouncer).
        const reason = isDbConsoleApiError(err) ? err.details?.reason : null;
        onUnavailable?.(typeof reason === "string" ? reason : "connect_failed");
      } else setFailure("generic");
    } finally {
      setSubmitting(false);
    }
  }

  const failureText =
    failure === "wrong"
      ? t("unlockWrong")
      : failure === "tooMany"
      ? t("unlockTooMany")
      : failure === "relogin"
      ? t("relogin")
      : failure === "generic"
      ? tErrors("loadFailed")
      : null;

  const noticeText =
    failure === null && notice === "relogin"
      ? t("relogin")
      : failure === null && notice === "expired"
      ? t("sessionExpired")
      : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="w-full max-w-md" onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 shrink-0" />
            {t("unlockTitle")}
          </DialogTitle>
          <DialogDescription>{t("unlockDesc")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {noticeText && (
            <Alert variant="warning-soft">
              <AlertDescription>{noticeText}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="db-console-secret">{viaMasterKey ? t("masterKeyLabel") : t("passwordLabel")}</Label>
            <Input
              id="db-console-secret"
              type="password"
              className="text-base md:text-sm"
              autoComplete={viaMasterKey ? "off" : "current-password"}
              autoFocus
              value={secret}
              disabled={submitting}
              onChange={(event) => setSecret(event.target.value)}
            />
          </div>

          {failureText && (
            <Alert variant="destructive">
              <AlertDescription>{failureText}</AlertDescription>
            </Alert>
          )}

          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{t("validityNote")}</span>
          </p>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" loading={submitting} disabled={!secret}>
              {t("unlockButton")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
