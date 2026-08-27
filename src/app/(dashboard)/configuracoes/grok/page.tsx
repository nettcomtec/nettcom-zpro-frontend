"use client";
import { ConfigPage } from "@/components/config/config-section";
import { Zap } from "lucide-react";
import { useTranslations } from "next-intl";

export default function GrokPage() {
  const t = useTranslations("grokPage");
  return (
    <ConfigPage
      title={t("title")}
      description={t("description")}
      icon={Zap}
      help={{
        description: t("helpDesc"),
        sections: [
          { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
          { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
          { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
        ],
      }}
      sections={[
        {
          title: t("title"),
          fields: [
            { key: "grok", label: t("enableLabel"), type: "boolean", description: t("enableDescription") },
            { key: "grokAllTickets", label: t("allTicketsLabel"), type: "boolean", description: t("allTicketsDescription") },
          ],
        },
      ]}
    />
  );
}
