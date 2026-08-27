"use client";
import { ConfigPage } from "@/components/config/config-section";
import { Brain } from "lucide-react";
import { useTranslations } from "next-intl";

export default function DeepSeekPage() {
  const t = useTranslations("deepseekPage");
  return (
    <ConfigPage
      title={t("title")}
      description={t("description")}
      icon={Brain}
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
            { key: "deepseek", label: t("enableLabel"), type: "boolean", description: t("enableDescription") },
            { key: "deepseekAllTickets", label: t("allTicketsLabel"), type: "boolean", description: t("allTicketsDescription") },
          ],
        },
      ]}
    />
  );
}
