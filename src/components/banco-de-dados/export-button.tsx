"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { exportDbConsoleCsv } from "@/services/db-console";
import type { DbConsoleExportRequest } from "@/types/db-console";
import { describeDbConsoleError } from "./helpers";

interface ExportButtonProps {
  request: DbConsoleExportRequest;
  disabled?: boolean;
}

export function ExportButton({ request, disabled }: ExportButtonProps) {
  const t = useTranslations("bancoDadosPage");
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    if (busy) return;
    setBusy(true);
    try {
      const { blob, filename } = await exportDbConsoleCsv(request);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast.success(t("exportDone"));
    } catch (err) {
      toast.error(describeDbConsoleError(err, t, t("exportFailed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={disabled || busy}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      <span className="ml-2">{busy ? t("exporting") : t("exportCsv")}</span>
    </Button>
  );
}
