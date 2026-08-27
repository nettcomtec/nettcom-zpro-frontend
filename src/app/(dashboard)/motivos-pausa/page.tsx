"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { usePageAccess } from "@/hooks/use-page-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { PauseReasonsManager } from "@/components/configuracoes/pause-reasons-manager";

export default function MotivosPausaPage() {
  const t = useTranslations("pauseReasonsPage");
  // Admin + supervisor gerem motivos de pausa (espelha o gate do backend).
  const allowed = usePageAccess("motivos-pausa", { adminSuperOnly: true });
  if (!allowed) return <AccessDenied />;

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      <PauseReasonsManager />
    </div>
  );
}
