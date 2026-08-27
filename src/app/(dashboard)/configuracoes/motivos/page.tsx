"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { ReasonsManager } from "@/components/configuracoes/reasons-manager";

export default function ConfigMotivosPage() {
  const t = useTranslations("configMotivosPage");

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        help={{
          description: t("helpDesc"),
          sections: [
            { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
            { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
          ],
        }}
      />
      <ReasonsManager />
    </div>
  );
}
