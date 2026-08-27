"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { logger } from "@/lib/logger";

export default function AtendimentoError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errorBoundary");

  useEffect(() => {
    logger.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] py-16 text-center">
      <div className="mb-4 rounded-full bg-destructive/10 p-4">
        <AlertTriangle className="h-8 w-8 text-destructive" />
      </div>
      <h3 className="text-lg font-semibold">{t("title")}</h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-md">
        {t("defaultError")}
      </p>
      <Button variant="outline" className="mt-4" onClick={reset}>
        <RefreshCw className="mr-2 h-4 w-4" /> {t("retry")}
      </Button>
    </div>
  );
}
