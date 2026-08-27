"use client";

import React, { useEffect } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageHeader } from "@/components/layout/page-header";
import { useAuthStore } from "@/stores/auth-store";
import { Mail } from "lucide-react";

export default function ConfiguracoesTenantLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("configuracoesTenantLayout");
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuthStore();

  const configLinks = [
    { name: t("smtpTenant"), href: "/configuracoesTenant/smtp-tenant", icon: Mail },
  ];

  // Guard: somente perfil superadmin
  useEffect(() => {
    if (user && user.profile !== "superadmin") {
      router.replace("/home");
    }
  }, [user, router]);

  if (!user || user.profile !== "superadmin") return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("title")}
        description={t("description")}
      />

      <div className="flex flex-col md:flex-row gap-4 md:gap-6">
        <aside className="w-full md:w-52 md:shrink-0">
          <div className="md:hidden overflow-x-auto -mx-3 px-3">
            <nav className="flex gap-2 w-max">
              {configLinks.map((link) => {
                const Icon = link.icon;
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors shrink-0",
                      active
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{link.name}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
          <ScrollArea className="hidden md:block h-[calc(100vh-12rem)]">
            <nav className="space-y-0.5 pr-2">
              {configLinks.map((link) => {
                const Icon = link.icon;
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{link.name}</span>
                  </Link>
                );
              })}
            </nav>
          </ScrollArea>
        </aside>

        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
