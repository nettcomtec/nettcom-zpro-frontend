"use client";
import { useTranslations } from "next-intl";
import { ConfigPage } from "@/components/config/config-section";
import { Shield } from "lucide-react";

export default function ProxyPage() {
  const t = useTranslations("configProxyPage");
  return (
    <ConfigPage
      title={t("title")}
      description={t("description")}
      icon={Shield}
      help={{
        description: t("helpDesc"),
        sections: [
          { title: t("helpS0T"), items: [t("helpS0I0"), t("helpS0I1"), t("helpS0I2")] },
          { title: t("helpS1T"), items: [t("helpS1I0"), t("helpS1I1")] },
        ],
      }}
      sections={[
        {
          title: t("sectionTitle"),
          fields: [
            {
              key: "proxyType",
              label: t("typeLabel"),
              type: "select",
              placeholder: t("typePlaceholder"),
              options: [
                { value: "http", label: "HTTP" },
                { value: "https", label: "HTTPS" },
                { value: "socks4", label: "SOCKS4" },
                { value: "socks5", label: "SOCKS5" },
              ],
            },
            { key: "proxyHost", label: t("hostLabel"), type: "text", placeholder: t("hostPlaceholder") },
            { key: "proxyPort", label: t("portLabel"), type: "number", placeholder: t("portPlaceholder") },
            { key: "proxyUsername", label: t("usernameLabel"), type: "text", placeholder: t("usernamePlaceholder") },
            { key: "proxyPassword", label: t("passwordLabel"), type: "password", placeholder: t("passwordPlaceholder") },
          ],
        },
      ]}
    />
  );
}
