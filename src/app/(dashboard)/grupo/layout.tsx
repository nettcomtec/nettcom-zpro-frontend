"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";

export default function GrupoLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("grupoLayout");
  const pathname = usePathname();

  const tabs = [
    { name: t("tabMassaGrupos"), href: "/grupo/massagrupos" },
    { name: t("tabMassaGrupos2"), href: "/grupo/massagrupos2" },
    { name: t("tabMassaUsuarios"), href: "/grupo/massausuarios" },
    { name: t("tabBanList"), href: "/grupo/banlist" },
    { name: t("tabWordList"), href: "/grupo/wordlist" },
    { name: t("tabSaudacao"), href: "/grupo/saudacao" },
    { name: t("tabDespedida"), href: "/grupo/despedida" },
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
