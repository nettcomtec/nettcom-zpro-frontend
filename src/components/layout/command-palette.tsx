"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock, Moon, Sun, LogOut, Send, Play, CircleDot } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
// P0-9: builder ÚNICO — a listagem do palette é a MESMA da sidebar (gates de
// plano, menuVisibility alias-aware, restrictedUser, união user+admin p/ perfil
// custom e lockdown de pagamento). O fork local de builders foi removido.
import {
  buildNavEntriesForProfile,
  performLogout,
  useAiCreditsNavVisible,
  type NavCategory,
  type NavItem,
  type ProfileType,
} from "@/components/layout/sidebar";
import { CONFIG_TAB_GROUPS } from "@/lib/config-links";
import { TOUR_RESTART_EVENT } from "@/components/tour/AppTour";

interface RecentPage {
  name: string;
  path: string;
  label: string;
}

/** Itens "achatados" de uma categoria (subgrupos da sidebar viram lista única). */
function flatItems(cat: NavCategory): NavItem[] {
  return cat.subgroups ? cat.subgroups.flatMap((sg) => sg.items) : cat.items;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [recentPages, setRecentPages] = useState<RecentPage[]>([]);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const router = useRouter();
  const t = useTranslations("commandPalette");
  const tSidebar = useTranslations("layoutSidebar");
  const tHeader = useTranslations("layoutHeader");
  const tTour = useTranslations("tour");
  const tConfig = useTranslations("configLayout");
  const tCommon = useTranslations("common");
  const { theme, setTheme } = useTheme();

  const { user, menuVisibility, tenantMenuVisibility, isRestrictedUser, paymentOverdue, canViewPayments, planFeatures } = useAuthStore();
  const wavoipEnabled = useAuthStore((s) => s.isWavoipEnabled());
  // Mesmo gate da sidebar (fail-closed): sem ele o builder esconde "Créditos de IA".
  const aiCreditsVisible = useAiCreditsNavVisible();
  const profile = (user?.profile || "user") as ProfileType;
  const isRestricted = isRestrictedUser();
  const isSuperAdmin = profile === "superadmin";
  const showPayments = canViewPayments();
  // Lockdown de pagamento atrasado (mesma fonte da sidebar): o palette lista
  // SÓ a rota de regularização — sem grupo Configurações, sem Ações.
  const lockdown = paymentOverdue && showPayments;

  const navCategories = useMemo(
    () =>
      buildNavEntriesForProfile({
        profile,
        menuVisibility: menuVisibility || {},
        t: tSidebar,
        isRestricted,
        planFeatures,
        paymentOverdue,
        showPayments,
        mustChangePassword: !!user?.mustChangePassword,
        resellerTermsPending: !!user?.resellerTermsPending,
        wavoipEnabled,
        tenantMenuVisibility: tenantMenuVisibility || {},
        aiCreditsVisible,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile, menuVisibility, tenantMenuVisibility, isRestricted, planFeatures, paymentOverdue, showPayments, user?.mustChangePassword, user?.resellerTermsPending, wavoipEnabled, aiCreditsVisible]
  );

  // Hub /configuracoes indexado no palette — MESMO gate do layout do hub
  // (somente perfil admin, configuracoes/layout.tsx:146-150/:174) e fora do
  // lockdown. Links asaasOnly (Pagamentos) são OMITIDOS: o estado asaas do
  // tenant não está disponível aqui, então omitir é o seguro (o link segue
  // acessível pela própria tela /configuracoes quando o gate passa).
  // Bloqueios de página única (termos pendentes / troca de senha) também zeram o
  // hub: a sidebar já fica vazia pelo builder e o backend nega essas rotas.
  const configLinks = useMemo(() => {
    if (lockdown || profile !== "admin" || user?.resellerTermsPending || user?.mustChangePassword) {
      return [] as { name: string; href: string; icon: React.ElementType; tabLabel: string }[];
    }
    return CONFIG_TAB_GROUPS.flatMap((g) =>
      g.links
        .filter((l) => !l.asaasOnly)
        .map((l) => ({
          name: l.labelKey ? tConfig(l.labelKey) : (l.label as string),
          href: l.href,
          icon: l.icon,
          tabLabel: tConfig(g.labelKey),
        }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockdown, profile, user?.resellerTermsPending, user?.mustChangePassword]);

  // Conjunto de rotas listáveis HOJE para este usuário (nav gated + hub) —
  // usado para gatear os Recentes: recente que aponta p/ rota oculta não aparece.
  const allowedHrefs = useMemo(() => {
    const set = new Set<string>();
    navCategories.forEach((cat) => flatItems(cat).forEach((i) => { if (!i.external) set.add(i.href); }));
    configLinks.forEach((l) => set.add(l.href));
    return set;
  }, [navCategories, configLinks]);

  const isPathAllowed = (path: string): boolean => {
    for (const href of allowedHrefs) {
      if (path === href || path.startsWith(href + "/")) return true;
    }
    return false;
  };

  const visibleRecents = recentPages.filter((p) => isPathAllowed(p.path));

  // Load recent pages from localStorage on open — mesma chave por usuário que o
  // layout grava em trackRecentPage (`recentPages:${userId}`) e a home lê.
  useEffect(() => {
    if (open) {
      try {
        if (!user?.userId) {
          setRecentPages([]);
          return;
        }
        const stored: RecentPage[] = JSON.parse(
          localStorage.getItem(`recentPages:${user.userId}`) || "[]"
        );
        setRecentPages(Array.isArray(stored) ? stored : []);
      } catch {
        setRecentPages([]);
      }
    }
  }, [open, user?.userId]);

  // Cmd+K / Ctrl+K listener + custom event listener
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const openHandler = () => setOpen(true);

    document.addEventListener("keydown", down);
    window.addEventListener("openCommandPalette", openHandler);

    return () => {
      document.removeEventListener("keydown", down);
      window.removeEventListener("openCommandPalette", openHandler);
    };
  }, []);

  const run = (href: string) => {
    router.push(href);
    setOpen(false);
  };

  const handleConfirmLogout = async (setOffline: boolean) => {
    setLoggingOut(true);
    // Mesmo fluxo do UserMenu/Sidebar (confirmação mantida via dialog abaixo).
    await performLogout(setOffline);
  };

  const actionsHeading = tCommon("actions");
  const configHeading = tSidebar("item.configuracoes");
  const themeLabel = theme === "dark" ? tSidebar("lightMode") : tSidebar("darkMode");
  const ThemeIcon = theme === "dark" ? Sun : Moon;

  return (
    <>
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={t("placeholder")} />
      <CommandList>
        <CommandEmpty>{t("empty")}</CommandEmpty>

        {visibleRecents.length > 0 && (
          <>
            <CommandGroup heading={t("group.recent")}>
              {visibleRecents.map((page) => (
                <CommandItem
                  key={page.path}
                  value={page.name}
                  onSelect={() => run(page.path)}
                >
                  <Clock className="mr-2 h-4 w-4 shrink-0 opacity-70" />
                  <span>{page.label || page.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Ações rápidas — oculto sob lockdown ("lista só a rota de regularização") */}
        {!lockdown && (
          <>
            <CommandGroup heading={actionsHeading}>
              {/* Alternar tema — mesmo toggle da sidebar (setTheme puro, sem reload) */}
              <CommandItem
                value={`${actionsHeading} ${themeLabel}`}
                onSelect={() => {
                  setTheme(theme === "dark" ? "light" : "dark");
                  setOpen(false);
                }}
              >
                <ThemeIcon className="mr-2 h-4 w-4 shrink-0" />
                <span>{themeLabel}</span>
              </CommandItem>
              {/* Rever tour — AppTour não instala o listener p/ superadmin */}
              {!isSuperAdmin && (
                <CommandItem
                  value={`${actionsHeading} ${tTour("replayBtn")}`}
                  onSelect={() => {
                    setOpen(false);
                    window.dispatchEvent(new Event(TOUR_RESTART_EVENT));
                  }}
                >
                  <Play className="mr-2 h-4 w-4 shrink-0" />
                  <span>{tTour("replayBtn")}</span>
                </CommandItem>
              )}
              {/* Nova Conversa — mesmo gate do botão do header; o header reavalia
                  o gate no listener (não confia no emissor) */}
              {!isSuperAdmin && !isRestricted && (
                <CommandItem
                  value={`${actionsHeading} ${tHeader("tooltips.newConversation")}`}
                  onSelect={() => {
                    setOpen(false);
                    window.dispatchEvent(new CustomEvent("zpro:new-conversation"));
                  }}
                >
                  <Send className="mr-2 h-4 w-4 shrink-0" />
                  <span>{tHeader("tooltips.newConversation")}</span>
                </CommandItem>
              )}
              {/* Sair — mesma confirmação (manter online / ficar offline) do UserMenu/Sidebar */}
              <CommandItem
                value={`${actionsHeading} ${tSidebar("logout")}`}
                onSelect={() => {
                  setOpen(false);
                  setLogoutDialogOpen(true);
                }}
              >
                <LogOut className="mr-2 h-4 w-4 shrink-0" />
                <span>{tSidebar("logout")}</span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {navCategories.map((category, idx) => {
          const items = flatItems(category);
          if (items.length === 0) return null;
          return (
            <React.Fragment key={category.key}>
              <CommandGroup heading={category.label}>
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <CommandItem
                      key={item.href}
                      value={`${category.label} ${item.name}`}
                      onSelect={() => run(item.href)}
                    >
                      <Icon className="mr-2 h-4 w-4 shrink-0" />
                      <span>{item.name}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              {(idx < navCategories.length - 1 || configLinks.length > 0) && <CommandSeparator />}
            </React.Fragment>
          );
        })}

        {/* Hub de Configurações (admin) — inclui as telas /configuracoes/app-* que
            não têm entrada própria na sidebar */}
        {configLinks.length > 0 && (
          <CommandGroup heading={configHeading}>
            {configLinks.map((link) => {
              const Icon = link.icon;
              return (
                <CommandItem
                  key={link.href}
                  value={`${configHeading} ${link.tabLabel} ${link.name}`}
                  onSelect={() => run(link.href)}
                >
                  <Icon className="mr-2 h-4 w-4 shrink-0" />
                  <span>{link.name}</span>
                  <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] leading-4 text-muted-foreground">
                    {link.tabLabel}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>

    {/* Confirmação de logout — mesmo dialog/fluxo da Sidebar e do UserMenu */}
    <Dialog open={logoutDialogOpen} onOpenChange={(o) => { if (!loggingOut) setLogoutDialogOpen(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogOut className="h-5 w-5" /> {tSidebar("logoutDialogTitle")}
          </DialogTitle>
          <DialogDescription>{tSidebar("logoutDialogDesc")}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" disabled={loggingOut} onClick={() => handleConfirmLogout(false)}>
            <CircleDot className="mr-2 h-4 w-4 text-emerald-500" />
            {tSidebar("logoutKeepOnline")}
          </Button>
          <Button variant="destructive" disabled={loggingOut} onClick={() => handleConfirmLogout(true)}>
            <CircleDot className="mr-2 h-4 w-4" />
            {tSidebar("logoutSetOffline")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
