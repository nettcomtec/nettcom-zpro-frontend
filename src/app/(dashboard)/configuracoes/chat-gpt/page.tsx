"use client";
import { ConfigPage } from "@/components/config/config-section";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Brain, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

export default function ChatGPTPage() {
  const t = useTranslations("chatGptPage");
  return (
    <ConfigPage
      title={t("title")}
      description={t("description")}
      icon={Brain}
      banner={
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t("assistantMigrationTitle")}</AlertTitle>
          <AlertDescription>{t("assistantMigrationDesc")}</AlertDescription>
        </Alert>
      }
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
            { key: "chatgpt", label: t("enableLabel"), type: "boolean", description: t("enableDescription") },
            { key: "chatgptAllTickets", label: t("allTicketsLabel"), type: "boolean", description: t("allTicketsDescription") },
          ],
        },
      ]}
    />
  );
}
