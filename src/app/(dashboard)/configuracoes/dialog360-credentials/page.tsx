"use client";

import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { GlobalProviderNotice } from "@/components/configuracoes/global-provider-notice";
import { Dialog360CredentialsForm } from "@/components/configuracoes/dialog360-credentials-form";

export default function Dialog360CredentialsPage() {
  const t = useTranslations("dialog360CredentialsPage");
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
      <GlobalProviderNotice providerType="dialog360_partner" />
      <Dialog360CredentialsForm />
    </div>
  );
}
