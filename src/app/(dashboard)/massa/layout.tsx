"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { useAuthStore } from "@/stores/auth-store";

export default function MassaLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("massaLayout");
  const pathname = usePathname();
  // Interruptor do WaVoIP no tenant: sem ele, a aba de discagem em massa some.
  const wavoipEnabled = useAuthStore((s) => s.isWavoipEnabled());

  const tabs = [
    { name: t("tabTemplate"), href: "/massa/template" },
    { name: t("tabTemplateVariavel"), href: "/massa/template-variavel" },
    { name: t("tabTexto"), href: "/massa/texto" },
    { name: t("tabTextoVariavel"), href: "/massa/textovariavel" },
    ...(wavoipEnabled ? [{ name: t("tabWavoip"), href: "/massa/wavoip" }] : []),
    { name: t("tabSms"), href: "/massa/sms" },
    { name: t("tabEmail"), href: "/massa/email" },
    { name: t("tabRelatorio"), href: "/massa/relatorio" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />
      <div className="flex gap-1 border-b overflow-x-auto">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              pathname === tab.href
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.name}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
