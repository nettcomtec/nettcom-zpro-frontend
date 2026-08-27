"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";
import { useAuthStore } from "@/stores/auth-store";

export default function FunilLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("funilLayout");
  const pathname = usePathname();
  const { user, supervisorAdmin, getConfigValue } = useAuthStore();

  const funnelPrivacy = getConfigValue("privacidadeFunil") === "enabled";
  const isAdmin = user?.profile === "admin" || (user?.profile === "super" && supervisorAdmin !== "enabled");
  const canAccessPipelineScreens = !funnelPrivacy || isAdmin;

  const allTabs = [
    { name: t("tabs.dashboard"), href: "/funil/dashboard", restricted: false },
    { name: t("tabs.kanban"), href: "/funil/kanban", restricted: false },
    { name: t("tabs.pipelines"), href: "/funil/pipelines", restricted: true },
    { name: t("tabs.calendar"), href: "/funil/calendar", restricted: false },
    { name: t("tabs.acao"), href: "/funil/acao", restricted: true },
    { name: t("tabs.acaoTicket"), href: "/funil/acao-ticket", restricted: true },
  ];

  const tabs = allTabs.filter((tab) => !tab.restricted || canAccessPipelineScreens);

  return (
    <div className="h-full flex flex-col gap-6 min-h-0">
      <PageHeader title={t("title")} description={t("description")} />
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 border-b shrink-0">
        <div className="inline-flex w-max gap-1">
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
      </div>
      <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
