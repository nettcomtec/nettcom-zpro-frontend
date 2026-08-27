"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, RefreshCw, Database, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { triggerSystemUpdate, triggerMigration, triggerClean } from "@/services/superadmin";

export default function AtualizarPage() {
  const t = useTranslations("atualizarPage");
  const tCommon = useTranslations("common");
  const [updatingStep, setUpdatingStep] = useState<string | null>(null);

  // Confirmação via AlertDialog (substitui o confirm() nativo): a operação só roda no Confirmar.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingOp, setPendingOp] = useState<{ label: string; fn: () => Promise<unknown> } | null>(null);

  function run(label: string, fn: () => Promise<unknown>) {
    setPendingOp({ label, fn });
    setConfirmOpen(true);
  }

  async function executePending() {
    if (!pendingOp) return;
    const { label, fn } = pendingOp;
    setUpdatingStep(label);
    try {
      await fn();
      toast.success(t("successStarted", { label }));
    } catch {
      toast.error(t("errorExecute", { label }));
    } finally {
      setUpdatingStep(null);
    }
  }

  const busy = updatingStep !== null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
            { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
          ],
        }}
      />

      <Alert variant="warning">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {t("warningMessage")}
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="h-5 w-5 text-primary" /> {t("updateSystemTitle")}
            </CardTitle>
            <CardDescription>{t("updateSystemDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="warning" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">{t("updateSystemWarning")}</AlertDescription>
            </Alert>
            <Button className="w-full" disabled={busy} onClick={() => run(t("updateSystemTitle"), triggerSystemUpdate)}>
              {updatingStep === t("updateSystemTitle") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {t("startUpdate")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-5 w-5 text-primary" /> {t("migrateFilesTitle")}
            </CardTitle>
            <CardDescription>{t("migrateFilesDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="warning" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">{t("migrateFilesWarning")}</AlertDescription>
            </Alert>
            <Button className="w-full" variant="outline" disabled={busy} onClick={() => run(t("migrateFilesTitle"), triggerMigration)}>
              {updatingStep === t("migrateFilesTitle") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
              {t("startMigration")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trash2 className="h-5 w-5 text-destructive" /> {t("cleanFilesTitle")}
            </CardTitle>
            <CardDescription>{t("cleanFilesDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">{t("cleanFilesWarning")}</AlertDescription>
            </Alert>
            <Button className="w-full" variant="destructive" disabled={busy} onClick={() => run(t("cleanFilesTitle"), triggerClean)}>
              {updatingStep === t("cleanFilesTitle") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              {t("startClean")}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Confirmação (AlertDialog) */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tCommon("confirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmPrompt", { label: pendingOp?.label ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={executePending}>{tCommon("confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
