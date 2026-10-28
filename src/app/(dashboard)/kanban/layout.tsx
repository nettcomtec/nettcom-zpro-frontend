"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/layout/page-header";

const tabs = [
  { labelKey: "tabBoard", href: "/kanban/board" },
  { labelKey: "tabTags", href: "/kanban/tags" },
];

export default function KanbanLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations("kanbanLayout");

  return (
    <div className="h-full flex flex-col gap-6 min-h-0">
      <PageHeader title={t("title")} description={t("description")} />
      <div className="flex gap-1 border-b shrink-0">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              pathname === tab.href
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(tab.labelKey)}
          </Link>
        ))}
      </div>
      <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
