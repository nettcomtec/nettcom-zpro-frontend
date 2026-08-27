"use client";
import { ConfigPage } from "@/components/config/config-section";
import { Network } from "lucide-react";
import { useTranslations } from "next-intl";

export default function N8NPage() {
  const t = useTranslations("n8nPage");
  return (
    <ConfigPage
      title={t("title")}
      description={t("description")}
      icon={Network}
      help={{
        description: t("helpDesc"),
        sections: [
          { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
          { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
        ],
      }}
      sections={[
        {
          title: t("title"),
          fields: [
            { key: "n8n", label: t("enableLabel"), type: "boolean", description: t("enableDescription") },
            { key: "n8nAllTickets", label: t("allTicketsLabel"), type: "boolean", description: t("allTicketsDescription") },
          ],
        },
      ]}
    />
  );
}
