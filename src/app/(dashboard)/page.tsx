"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuthStore } from "@/stores/auth-store";
import { useBrandingStore } from "@/stores/branding-store";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslations } from "next-intl";
import {
  BarChart3,
  MessageSquare,
  Contact2,
  MessageCircle,
  Inbox,
  Users,
  Tag,
  Settings,
  Zap,
  Shield,
  BarChart2,
  Phone,
  ChevronRight,
  LayoutDashboard,
  History,
  Building2,
  CheckCircle2,
  Plug,
  Rocket,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { fetchTenantById } from "@/services/tenants";
import { fetchWhatsapps } from "@/services/whatsapp";
import { fetchQueues } from "@/services/queues";
import { fetchUsers } from "@/services/users";
import { fetchTickets } from "@/services/tickets";

interface QuickAccessItem {
  label: string;
  description: string;
  href: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}

interface InfoItem {
  icon: React.ElementType;
  text: string;
  color: string;
}

interface QuickLink {
  label: string;
  description: string;
  href: string;
  icon: React.ElementType;
  color: string;
}

// Onboarding "Primeiros passos" (FASE 7.2) — resultado das verificações reais.
// null = ainda não carregado OU alguma verificação falhou (card não aparece).
interface OnboardingChecks {
  channel: boolean;
  queue: boolean;
  team: boolean;
  conversation: boolean;
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export default function HomePage() {
  const { user } = useAuthStore();
  const { appName } = useBrandingStore();
  const router = useRouter();
  const t = useTranslations("dashboardHomePage");
  const [recentPages, setRecentPages] = useState<{ name: string; path: string; label: string }[]>([]);
  const [tenantName, setTenantName] = useState("");
  const [onboardingChecks, setOnboardingChecks] = useState<OnboardingChecks | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  useEffect(() => {
    if (!user?.userId) return;
    try {
      const stored = JSON.parse(localStorage.getItem(`recentPages:${user.userId}`) || "[]");
      setRecentPages(stored);
    } catch { /* ignore */ }
  }, [user?.userId]);

  // Nome da empresa (tenant) do usuário logado — exibido no card de boas-vindas.
  // O endpoint devolve o tenant do próprio usuário (backend usa req.user.tenantId).
  useEffect(() => {
    if (!user?.tenantId) return;
    let cancelled = false;
    fetchTenantById(user.tenantId)
      .then(({ data }) => {
        if (cancelled) return;
        const tenant = Array.isArray(data) ? data[0] : data;
        setTenantName((tenant as { name?: string })?.name || "");
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.tenantId]);

  // Onboarding "Primeiros passos" — checklist derivado de dados reais, SÓ admin.
  // 1× no mount, best-effort: cada fetch tem catch individual; se QUALQUER
  // verificação falhar, o card simplesmente não aparece (nunca quebra o home).
  useEffect(() => {
    if (user?.profile !== "admin" || !user?.userId) return;
    const dismissKey = `onboardingDismissed:${user?.tenantId ?? "t"}:${user.userId}`;
    try {
      if (localStorage.getItem(dismissKey) === "1") {
        setOnboardingDismissed(true);
        return; // dispensado manualmente — nem dispara os fetches
      }
    } catch { /* ignore */ }
    let cancelled = false;
    Promise.all([
      fetchWhatsapps()
        .then(({ data }) => (Array.isArray(data) ? data : []))
        .catch(() => null),
      fetchQueues()
        .then(({ data }) => (Array.isArray(data) ? data : []))
        .catch(() => null),
      // /users devolve o count TOTAL do tenant já na 1ª página (findAndCountAll).
      fetchUsers()
        .then(({ data }) => data as { users?: unknown[]; count?: number })
        .catch(() => null),
      // Heurística barata p/ "primeira conversa": 1ª página da lista de tickets
      // (mesmo endpoint do atendimento, LIMIT ~30 no backend), incluindo fechados.
      // status: [] => backend (admin+showAll) assume open/pending/closed.
      fetchTickets({ pageNumber: 1, showAll: true, includeClosed: true, status: [] })
        .then(({ data }) => data as { tickets?: unknown[] })
        .catch(() => null),
    ]).then(([channels, queues, usersData, ticketsData]) => {
      if (cancelled) return;
      if (!channels || !queues || !usersData || !ticketsData) return;
      setOnboardingChecks({
        channel: channels.some((c) => c?.status === "CONNECTED"),
        queue: queues.length >= 1,
        team: Number(usersData.count ?? usersData.users?.length ?? 0) >= 2,
        conversation: Array.isArray(ticketsData.tickets) && ticketsData.tickets.length >= 1,
      });
    });
    return () => { cancelled = true; };
  }, [user?.profile, user?.userId, user?.tenantId]);

  useEffect(() => {
    if (user?.profile === "superadmin") {
      router.replace("/assinatura");
    }
  }, [user?.profile, router]);

  if (user?.profile === "superadmin") return null;

  const userName = user?.username || user?.email?.split("@")[0] || t("defaultUser");
  const initials = userName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const profile = user?.profile as string | undefined;
  const isAdmin = profile === "admin";
  const isSuper = profile === "super";

  // Onboarding "Primeiros passos" — só admin; some sozinho quando TODOS os
  // itens estão done, ou quando dispensado manualmente (localStorage).
  const onboardingSteps = onboardingChecks
    ? [
        {
          key: "channel",
          done: onboardingChecks.channel,
          href: "/sessoes",
          icon: Plug,
          label: t("onboarding.steps.channel.label"),
          description: t("onboarding.steps.channel.description"),
        },
        {
          key: "queue",
          done: onboardingChecks.queue,
          href: "/filas",
          icon: Inbox,
          label: t("onboarding.steps.queue.label"),
          description: t("onboarding.steps.queue.description"),
        },
        {
          key: "team",
          done: onboardingChecks.team,
          href: "/usuarios",
          icon: Users,
          label: t("onboarding.steps.team.label"),
          description: t("onboarding.steps.team.description"),
        },
        {
          key: "conversation",
          done: onboardingChecks.conversation,
          href: "/atendimento",
          icon: MessageSquare,
          label: t("onboarding.steps.conversation.label"),
          description: t("onboarding.steps.conversation.description"),
        },
      ]
    : [];
  const onboardingDoneCount = onboardingSteps.filter((s) => s.done).length;
  const showOnboarding =
    isAdmin &&
    !onboardingDismissed &&
    onboardingSteps.length > 0 &&
    onboardingDoneCount < onboardingSteps.length;

  const dismissOnboarding = () => {
    try {
      localStorage.setItem(
        `onboardingDismissed:${user?.tenantId ?? "t"}:${user?.userId}`,
        "1"
      );
    } catch { /* ignore */ }
    setOnboardingDismissed(true);
  };

  const quickAccess: QuickAccessItem[] = isAdmin
    ? [
        {
          label: t("quickAccess.atendimento.label"),
          description: t("quickAccess.atendimento.description"),
          href: "/atendimento",
          icon: MessageSquare,
          color: "text-emerald-600 dark:text-emerald-400",
          bg: "bg-emerald-100 dark:bg-emerald-900/40",
        },
        {
          label: t("quickAccess.dashboard.label"),
          description: t("quickAccess.dashboard.description"),
          href: "/dashboard",
          icon: BarChart3,
          color: "text-blue-600 dark:text-blue-400",
          bg: "bg-blue-100 dark:bg-blue-900/40",
        },
        {
          label: t("quickAccess.configuracoes.label"),
          description: t("quickAccess.configuracoes.description"),
          href: "/configuracoes",
          icon: Settings,
          color: "text-slate-600 dark:text-slate-400",
          bg: "bg-slate-100 dark:bg-slate-900/40",
        },
      ]
    : isSuper
    ? [
        {
          label: t("quickAccess.atendimento.label"),
          description: t("quickAccess.atendimento.description"),
          href: "/atendimento",
          icon: MessageSquare,
          color: "text-emerald-600 dark:text-emerald-400",
          bg: "bg-emerald-100 dark:bg-emerald-900/40",
        },
        {
          label: t("quickAccess.dashboard.label"),
          description: t("quickAccess.dashboard.description"),
          href: "/dashboard",
          icon: BarChart3,
          color: "text-blue-600 dark:text-blue-400",
          bg: "bg-blue-100 dark:bg-blue-900/40",
        },
        {
          label: t("quickAccess.relatorios.label"),
          description: t("quickAccess.relatorios.description"),
          href: "/relatorios",
          icon: BarChart2,
          color: "text-amber-600 dark:text-amber-400",
          bg: "bg-amber-100 dark:bg-amber-900/40",
        },
      ]
    : [
        {
          label: t("quickAccess.atendimento.label"),
          description: t("quickAccess.atendimento.description"),
          href: "/atendimento",
          icon: MessageSquare,
          color: "text-emerald-600 dark:text-emerald-400",
          bg: "bg-emerald-100 dark:bg-emerald-900/40",
        },
        {
          label: t("quickAccess.contatos.label"),
          description: t("quickAccess.contatos.description"),
          href: "/contatos",
          icon: Contact2,
          color: "text-violet-600 dark:text-violet-400",
          bg: "bg-violet-100 dark:bg-violet-900/40",
        },
        {
          label: t("quickAccess.chatPrivado.label"),
          description: t("quickAccess.chatPrivado.description"),
          href: "/chat-privado",
          icon: MessageCircle,
          color: "text-indigo-600 dark:text-indigo-400",
          bg: "bg-indigo-100 dark:bg-indigo-900/40",
        },
      ];

  const infoItems: InfoItem[] = [
    { icon: Zap, text: t("infoItems.dashboardMetrics"), color: "text-amber-500" },
    { icon: Shield, text: t("infoItems.dataProtected"), color: "text-emerald-500" },
    { icon: BarChart2, text: t("infoItems.detailedReports"), color: "text-blue-500" },
    { icon: Phone, text: t("infoItems.wavoipIntegration"), color: "text-green-500" },
  ];

  const quickLinks: QuickLink[] = isAdmin
    ? [
        { label: t("quickLinks.dashboard.label"), description: t("quickLinks.dashboard.description"), href: "/dashboard", icon: LayoutDashboard, color: "text-blue-500" },
        { label: t("quickLinks.chatPrivado.label"), description: t("quickLinks.chatPrivado.description"), href: "/chat-privado", icon: MessageCircle, color: "text-indigo-500" },
        { label: t("quickLinks.filas.label"), description: t("quickLinks.filas.description"), href: "/filas", icon: Inbox, color: "text-orange-500" },
        { label: t("quickLinks.usuarios.label"), description: t("quickLinks.usuarios.description"), href: "/usuarios", icon: Users, color: "text-pink-500" },
        { label: t("quickLinks.etiquetas.label"), description: t("quickLinks.etiquetas.description"), href: "/etiquetas", icon: Tag, color: "text-cyan-500" },
        { label: t("quickLinks.relatorios.label"), description: t("quickLinks.relatorios.description"), href: "/relatorios", icon: BarChart3, color: "text-teal-500" },
        { label: t("quickLinks.configuracoes.label"), description: t("quickLinks.configuracoes.description"), href: "/configuracoes", icon: Settings, color: "text-gray-500" },
      ]
    : isSuper
    ? [
        { label: t("quickLinks.dashboard.label"), description: t("quickLinks.dashboard.description"), href: "/dashboard", icon: LayoutDashboard, color: "text-blue-500" },
        { label: t("quickLinks.chatPrivado.label"), description: t("quickLinks.chatPrivado.description"), href: "/chat-privado", icon: MessageCircle, color: "text-indigo-500" },
        { label: t("quickLinks.filas.label"), description: t("quickLinks.filas.description"), href: "/filas", icon: Inbox, color: "text-orange-500" },
        { label: t("quickLinks.etiquetas.label"), description: t("quickLinks.etiquetas.description"), href: "/etiquetas", icon: Tag, color: "text-cyan-500" },
        { label: t("quickLinks.relatorios.label"), description: t("quickLinks.relatorios.description"), href: "/relatorios", icon: BarChart3, color: "text-teal-500" },
      ]
    : [
        { label: t("quickLinks.dashboard.label"), description: t("quickLinks.dashboard.description"), href: "/dashboard", icon: LayoutDashboard, color: "text-blue-500" },
        { label: t("quickLinks.chatPrivado.label"), description: t("quickLinks.chatPrivado.description"), href: "/chat-privado", icon: MessageCircle, color: "text-indigo-500" },
        { label: t("quickLinks.contatos.label"), description: t("quickLinks.contatos.description"), href: "/contatos", icon: Contact2, color: "text-violet-500" },
        { label: t("quickLinks.campanhas.label"), description: t("quickLinks.campanhas.description"), href: "/campanhas", icon: Tag, color: "text-cyan-500" },
      ];

  return (
    <motion.div
      className="space-y-8"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {/* Primeiros passos — onboarding acionável (SÓ admin; some quando completo ou dispensado) */}
      {showOnboarding && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-primary/25">
            <CardContent className="p-6">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Rocket className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">{t("onboarding.title")}</h2>
                    <p className="text-sm text-muted-foreground">{t("onboarding.subtitle")}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("onboarding.progress", { done: onboardingDoneCount, total: onboardingSteps.length })}
                  </span>
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={dismissOnboarding}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                          {t("onboarding.dismiss")}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs text-xs">
                        {t("onboarding.dismissTooltip")}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {onboardingSteps.map((step, index) => {
                  const StepIcon = step.icon;
                  if (step.done) {
                    return (
                      <div
                        key={step.key}
                        className="flex items-start gap-3 rounded-lg border border-transparent bg-muted/30 p-3"
                      >
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                            <StepIcon className="h-3.5 w-3.5 shrink-0" />
                            {step.label}
                          </p>
                          <p className="text-xs text-success">{t("onboarding.stepDone")}</p>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <Link key={step.key} href={step.href}>
                      <div className="group flex h-full cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:border-primary/30 hover:bg-muted/50">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 text-sm font-medium">
                            <StepIcon className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                            {step.label}
                          </p>
                          <p className="text-xs text-muted-foreground">{step.description}</p>
                        </div>
                        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground opacity-40 transition-opacity group-hover:opacity-100" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Welcome Card */}
      <motion.div variants={item}>
        <Card className="overflow-hidden border-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent dark:from-primary/20 dark:via-primary/10 shadow-lg">
          <CardContent className="p-8 md:p-10 h-full">
            <div className="flex items-center justify-between h-full">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12 shrink-0">
                    <AvatarImage src={user?.profilePicture || ""} alt={userName} />
                    <AvatarFallback className="bg-primary text-primary-foreground font-semibold">{initials}</AvatarFallback>
                  </Avatar>
                  <h1 className="text-3xl md:text-4xl font-bold text-foreground">
                    {t("welcome", { name: userName })}
                  </h1>
                </div>
                <p className="text-lg text-muted-foreground">
                  {t("subtitle", { appName: appName || "APP" })}
                </p>
                {(tenantName || user?.profile) && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {tenantName && (
                      <TooltipProvider delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground/80 cursor-default">
                              <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                              {tenantName}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-xs text-xs">
                            {t("companyTooltip")}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {user?.profile && (
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary capitalize">
                        {user.profile}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="hidden md:flex items-center justify-center">
                <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-primary/10 dark:bg-primary/20">
                  <LayoutDashboard className="h-12 w-12 text-primary" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Quick Access Cards */}
      <motion.div variants={item}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickAccess.map((qa) => {
            const Icon = qa.icon;
            return (
              <Link key={qa.href} href={qa.href}>
                <Card className="group h-full cursor-pointer border transition-all duration-200 hover:shadow-lg hover:-translate-y-1 hover:border-primary/30">
                  <CardContent className="flex flex-col items-center justify-center p-8 text-center">
                    <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-xl ${qa.bg} transition-transform group-hover:scale-110`}>
                      <Icon className={`h-7 w-7 ${qa.color}`} />
                    </div>
                    <h3 className="text-lg font-semibold mb-1">{qa.label}</h3>
                    <p className="text-sm text-muted-foreground">{qa.description}</p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </motion.div>

      {/* Recent Pages */}
      {recentPages.length > 0 && (
        <motion.div variants={item}>
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                {t("recentPages")}
              </h2>
              <div className="flex flex-wrap gap-2">
                {recentPages.map((page) => (
                  <Link key={page.path} href={page.path}>
                    <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted/50 cursor-pointer group">
                      <span className="font-medium">{page.label}</span>
                      <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Info + Quick Links */}
      <motion.div variants={item}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quick Info */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                {t("quickInfoTitle")}
              </h2>
              <div className="space-y-1">
                {infoItems.map((info, i) => {
                  const InfoIcon = info.icon;
                  return (
                    <div key={i} className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-muted/50">
                      <InfoIcon className={`h-5 w-5 shrink-0 ${info.color}`} />
                      <span className="text-sm text-foreground/80">{info.text}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Quick Links */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <LayoutDashboard className="h-5 w-5 text-primary" />
                {t("quickLinksTitle")}
              </h2>
              <div className="space-y-1">
                {quickLinks.map((link) => {
                  const LinkIcon = link.icon;
                  return (
                    <Link key={link.href} href={link.href}>
                      <div className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-muted/50 group cursor-pointer">
                        <LinkIcon className={`h-5 w-5 shrink-0 ${link.color}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{link.label}</p>
                          <p className="text-xs text-muted-foreground">{link.description}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </motion.div>
    </motion.div>
  );
}
