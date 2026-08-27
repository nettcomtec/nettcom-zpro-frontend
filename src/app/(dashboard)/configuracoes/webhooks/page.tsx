"use client";
import { useTranslations } from "next-intl";
import { ConfigPage, type ConfigSectionDef } from "@/components/config/config-section";
import { Globe } from "lucide-react";

export default function ConfigWebhooksPage() {
  const t = useTranslations("webhooksPage");

  const sections: ConfigSectionDef[] = [
    {
      title: t("mainTitle"),
      description: t("mainDescription"),
      fields: [
        { key: "webhook", label: t("enableLabel"), type: "boolean" },
        { key: "webhookUrl", label: t("urlLabel"), type: "url", placeholder: t("urlPlaceholder") },
        { key: "webhookMessage", label: t("messagesLabel"), type: "boolean", description: t("messagesDescription") },
      ],
    },
    {
      title: t("channelEventsTitle"),
      description: t("channelEventsDescription"),
      fields: [
        { key: "webhookCreateChannel", label: t("createChannelLabel"), type: "boolean" },
        { key: "webhookUpdateChannel", label: t("updateChannelLabel"), type: "boolean" },
        { key: "webhookCreateUser", label: t("createUserLabel"), type: "boolean" },
        { key: "webhookUpdateUser", label: t("updateUserLabel"), type: "boolean" },
        { key: "webhookCreateApi", label: t("createApiLabel"), type: "boolean" },
        { key: "webhookUpdateApi", label: t("updateApiLabel"), type: "boolean" },
        { key: "webhookRenewApi", label: t("renewApiLabel"), type: "boolean" },
      ],
    },
  ];

  return (
    <ConfigPage
      title={t("title")}
      description={t("description")}
      sections={sections}
      icon={Globe}
      help={{
        description: t("helpDesc"),
        sections: [
          { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
          { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1"), t("helpS1I2")] },
          { title: t("helpS2T"), items: [t("helpS2I0"), t("helpS2I1")] },
        ],
      }}
    />
  );
}
