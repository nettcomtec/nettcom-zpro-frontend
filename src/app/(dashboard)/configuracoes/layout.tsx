"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStore } from "@/stores/auth-store";
import api from "@/lib/api";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CONFIG_TAB_GROUPS, type ConfigTabKey } from "@/lib/config-links";

type TabKey = ConfigTabKey;

interface ConfigLink {
  name: string;
  href: string;
  icon: React.ElementType;
  asaasOnly?: boolean;
}

// P0-9: os DADOS dos links vivem no módulo puro lib/config-links.ts (fonte
// única, também indexada pelo CommandPalette). Aqui só resolvemos os labels
// i18n — zero mudança de comportamento em relação à lista inline anterior.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildTabGroups(t: any): { key: TabKey; label: string; links: ConfigLink[] }[] {
  return CONFIG_TAB_GROUPS.map((g) => ({
    key: g.key,
    label: t(g.labelKey),
    links: g.links.map((l) => ({
      name: l.labelKey ? t(l.labelKey) : (l.label as string),
      href: l.href,
      icon: l.icon,
      ...(l.asaasOnly ? { asaasOnly: true } : {}),
    })),
  }));
}

function getTabForPath(pathname: string, tabGroups: { key: TabKey; links: ConfigLink[] }[]): TabKey {
  for (const group of tabGroups) {
    if (group.links.some((l) => pathname.startsWith(l.href))) {
      return group.key;
    }
  }
  return "gerais";
}

export default function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("configLayout");
  // Reuso de chaves genericas de busca ("Buscar..." / "Nenhum resultado encontrado.")
  const tSearch = useTranslations("searchableSelect");
  const pathname = usePathname();
  const router = useRouter();
  const { user, hasPermission } = useAuthStore();
  const TAB_GROUPS = buildTabGroups(t);
  const [activeTab, setActiveTab] = useState<TabKey>(() => getTabForPath(pathname, TAB_GROUPS));
  const [asaasEnabled, setAsaasEnabled] = useState(false);
  const [search, setSearch] = useState("");

  // Guard: admin, ou perfil custom com a permission settings_general (que é o gate
  // real no backend — tenantRoutesZPRO aplica requirePermission("settings_general")
  // nas rotas de escrita de configuração do tenant). Antes o layout barrava tudo que
  // não fosse admin, deixando a chave de menu `configuracoes` inerte para o custom.
  const canOpenSettings =
    !user ||
    user.profile === "admin" ||
    (user.profile === "custom" && hasPermission("settings_general"));

  useEffect(() => {
    if (user && !canOpenSettings) {
      router.replace("/home");
    }
  }, [user, canOpenSettings, router]);

  // Verificar se Asaas está habilitado para o tenant
  useEffect(() => {
    if (!user?.tenantId) return;
    api
      .get(`/tenants/${user.tenantId}`)
      .then((res) => {
        const tenant = Array.isArray(res.data) ? res.data[0] : res.data;
        setAsaasEnabled(tenant?.asaas === "enabled");
      })
      .catch(() => {});
  }, [user?.tenantId]);

  // Sincronizar tab ativa com a rota atual
  useEffect(() => {
    setActiveTab(getTabForPath(pathname, TAB_GROUPS));
  }, [pathname]);

  // Limpar busca ao trocar de tab
  useEffect(() => {
    setSearch("");
  }, [activeTab]);

  if (!user || !canOpenSettings) return null;

  const currentGroup = TAB_GROUPS.find((g) => g.key === activeTab) ?? TAB_GROUPS[0];
  const visibleLinks = currentGroup.links.filter(
    (l) => !l.asaasOnly || asaasEnabled
  );
  const searchTerm = search.trim().toLowerCase();
  // Busca cross-abas: com termo digitado, procura em TODOS os grupos (mantendo o
  // gate asaasOnly); resultado de outra aba exibe o nome da aba como badge e, ao
  // clicar, troca a activeTab alem de navegar.
  const filteredLinks: (ConfigLink & { tabKey: TabKey; tabLabel: string })[] = searchTerm
    ? TAB_GROUPS.flatMap((g) =>
        g.links
          .filter(
            (l) =>
              (!l.asaasOnly || asaasEnabled) &&
              l.name.toLowerCase().includes(searchTerm)
          )
          .map((l) => ({ ...l, tabKey: g.key, tabLabel: g.label }))
      )
    : visibleLinks.map((l) => ({ ...l, tabKey: currentGroup.key, tabLabel: currentGroup.label }));

  return (
    <div className="space-y-3">
      <PageHeader title={t("title")} description={t("description")} />

      {/* Tabs de categorias — native horizontal scroll for touch support */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
        <div className="overflow-x-auto scrollbar-none -mx-3 md:mx-0 px-3 md:px-0">
          <TabsList className="flex h-auto gap-1 w-max">
            {TAB_GROUPS.map((g) => (
              <TabsTrigger key={g.key} value={g.key} className="shrink-0 text-xs md:text-sm">
                {g.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      {/* Mobile: horizontal scroll nav for sub-items */}
      <div className="md:hidden overflow-x-auto scrollbar-none -mx-3 px-3">
        <nav className="flex gap-1.5 w-max pb-1">
          {visibleLinks.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors shrink-0 whitespace-nowrap",
                  active
                    ? "bg-primary text-primary-foreground font-medium"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {link.name}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex gap-6">
        {/* Sidebar com sub-itens do tab ativo — desktop only */}
        <aside className="hidden md:block w-52 shrink-0">
          {/* Search input */}
          <div className="relative mb-2 pr-2">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tSearch("searchPlaceholder")}
              className="pl-8 pr-7 h-8 text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                type="button"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <nav className="space-y-0.5 pr-2">
            {filteredLinks.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground text-center">
                {tSearch("empty")}
              </p>
            ) : (
              filteredLinks.map((link) => {
                const Icon = link.icon;
                const active = pathname === link.href;
                const crossTab = link.tabKey !== activeTab;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => {
                      if (crossTab) setActiveTab(link.tabKey);
                    }}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{link.name}</span>
                    {crossTab && (
                      <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] leading-4 text-muted-foreground">
                        {link.tabLabel}
                      </span>
                    )}
                  </Link>
                );
              })
            )}
          </nav>
        </aside>

        {/* Conteúdo da página */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
