"use client";

import React, { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { planAllowsRoute, type PlanFeatures } from "@/lib/plan-capabilities";
import { isMenuRouteHidden } from "@/lib/menu-visibility";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  LayoutDashboard, MessageSquare, Users, Contact2, Settings, Inbox,
  BarChart3, Megaphone, Send, Tag, Calendar, CalendarClock, FileText, Shield,
  Server, CreditCard, Building2,
  Moon, Sun, LogOut, User, Kanban, GitBranch, Clock,
  Bell, Phone, Monitor, Database, Palette,
  RefreshCw, Globe, Headphones, Star, AlertTriangle,
  MessageCircle, Workflow, Target, PanelLeftClose, PanelLeft,
  ChevronRight, Rocket, Bot, ClipboardList, Image as ImageIcon,
  StickyNote, Split, Cog, PhoneCall, Gift, Instagram,
  BarChart2, Youtube, Music2,
  HardDrive, Download, Smartphone, CheckCircle2, X, ShoppingBag, Package, Linkedin, Facebook,
  Home, Compass, Receipt, CircleDot, PauseCircle, ListChecks, MailPlus, DatabaseZap,
  Coins, Sparkles,
} from "lucide-react";
import { updateUserIsOnline } from "@/services/users";
import { unsubscribePush } from "@/lib/push-subscription";
import { getBullBoardStatus } from "@/services/superadmin";
import { getInitials } from "@/lib/utils";
import { useBrandingStore } from "@/stores/branding-store";
import { useInstallPWA } from "@/hooks/use-install-pwa";
import { getLogoUrl, getLogoDarkUrl } from "@/lib/branding-urls";

export interface NavItem {
  name: string;
  nameKey?: string;
  href: string;
  icon: React.ElementType;
  routeName?: string;
  tourId?: string;
  external?: boolean;
}

export interface NavSubgroup {
  label: string;
  items: NavItem[];
}

export interface NavCategory {
  key: string;
  label: string;
  icon: React.ElementType;
  items: NavItem[];
  subgroups?: NavSubgroup[];
  defaultOpen?: boolean;
}

export type ProfileType = "user" | "admin" | "super" | "superadmin" | "custom";

const sortItems = (items: NavItem[]) =>
  [...items].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

// Paleta corporativa: apenas ícone e dot por seção — labels sempre neutros
const CATEGORY_COLORS: Record<string, { icon: string; dot: string }> = {
  principal:               { icon: "text-primary/70",          dot: "bg-primary/70" },
  atendimento:             { icon: "text-blue-400 dark:text-blue-400",     dot: "bg-blue-400" },
  "comunicacao-marketing": { icon: "text-slate-400",            dot: "bg-slate-400" },
  gestao:                  { icon: "text-amber-400/80",         dot: "bg-amber-400/80" },
  "user-conta":            { icon: "text-sidebar-foreground/40", dot: "bg-sidebar-foreground/30" },
  "sup-administracao":     { icon: "text-rose-400/80",          dot: "bg-rose-400/80" },
  "sup-automacao":         { icon: "text-indigo-400/80",        dot: "bg-indigo-400/80" },
  "sup-gestao-comercial":  { icon: "text-amber-400/80",         dot: "bg-amber-400/80" },
  "adm-administracao":     { icon: "text-rose-400/80",          dot: "bg-rose-400/80" },
  "adm-automacao":         { icon: "text-indigo-400/80",        dot: "bg-indigo-400/80" },
  "adm-gestao-comercial":  { icon: "text-amber-400/80",         dot: "bg-amber-400/80" },
  "adm-configuracao":      { icon: "text-slate-400",            dot: "bg-slate-400" },
  "sa-tenants":            { icon: "text-blue-400/80",          dot: "bg-blue-400/80" },
  "sa-config":             { icon: "text-slate-400",            dot: "bg-slate-400" },
  "sa-canais":             { icon: "text-teal-400/80",          dot: "bg-teal-400/80" },
  "sa-sistema":            { icon: "text-rose-400/80",          dot: "bg-rose-400/80" },
  "sa-conta":              { icon: "text-sidebar-foreground/40", dot: "bg-sidebar-foreground/30" },
};

const DEFAULT_CAT_COLORS = { icon: "text-sidebar-foreground/40", dot: "bg-sidebar-foreground/30" };

function getCategoryColors(key: string) {
  return CATEGORY_COLORS[key] ?? DEFAULT_CAT_COLORS;
}

function buildUserMenu(t: (key: string) => string): NavCategory[] {
  return [
    {
      key: "atendimento",
      label: t("cat.atendimento"),
      icon: Headphones,
      items: sortItems([
        { name: t("item.atendimentos"), href: "/atendimento", icon: MessageSquare, routeName: "atendimento", tourId: "tour-atendimento" },
        { name: t("item.chatPrivado"), href: "/chat-privado", icon: MessageCircle, routeName: "chat-privado", tourId: "tour-chat-privado" },
        { name: t("item.contatos"), href: "/contatos", icon: Contact2, routeName: "contatos", tourId: "tour-contatos" },
      ]),
    },
    {
      key: "comunicacao-marketing",
      label: t("cat.comunicacaoMarketing"),
      icon: Megaphone,
      items: [],
      subgroups: [
        {
          label: t("subgroup.comunicacao"),
          items: sortItems([
            { name: t("item.campanhas"), href: "/campanhas", icon: Target, routeName: "campanhas", tourId: "tour-campanhas" },
            { name: t("item.emailMarketing"), href: "/email-marketing", icon: MailPlus, routeName: "email-marketing", tourId: "tour-email-marketing" },
            { name: t("item.envioEmMassa"), href: "/massa", icon: Rocket, routeName: "massa", tourId: "tour-massa" },
            { name: t("item.galeria"), href: "/galeria", icon: ImageIcon, routeName: "galeria", tourId: "tour-galeria" },
            { name: t("item.googleCalendar"), href: "/google-calendar", icon: Calendar, routeName: "google-calendar" },
            { name: t("item.grupos"), href: "/grupo", icon: Users, routeName: "grupo", tourId: "tour-grupos" },
            { name: t("item.mensagensRapidas"), href: "/mensagens-rapidas", icon: Send, routeName: "mensagens-rapidas", tourId: "tour-mensagens-rapidas" },
          ]),
        },
        {
          label: t("subgroup.redesSociais"),
          items: sortItems([
            { name: t("item.facebookComentarios"), href: "/facebook-comentarios", icon: Facebook, routeName: "facebook-comentarios" },
            { name: t("item.instagram"), href: "/instagram-comentarios", icon: Instagram, routeName: "instagram-comentarios" },
            { name: t("item.tiktokComentarios"), href: "/tiktok-comentarios", icon: Music2, routeName: "tiktok-comentarios" },
            { name: t("item.youtubeComentarios"), href: "/youtube-comentarios", icon: Youtube, routeName: "youtube-comentarios" },
            { name: t("item.rocketChat"), href: "/chat-interno-rc", icon: MessageSquare, routeName: "chat-interno-rc" },
          ]),
        },
      ],
    },
    {
      key: "gestao",
      label: t("cat.gestao"),
      icon: BarChart2,
      items: sortItems([
        { name: t("item.funil"), href: "/funil", icon: GitBranch, routeName: "funil", tourId: "tour-funil" },
        { name: t("item.kanban"), href: "/kanban", icon: Kanban, routeName: "kanban", tourId: "tour-kanban" },
        { name: t("item.tarefas"), href: "/tarefas", icon: ClipboardList, routeName: "tarefas", tourId: "tour-tarefas" },
        { name: t("item.agenda"), href: "/agenda", icon: Calendar, routeName: "agenda", tourId: "tour-agenda" },
      ]),
    },
    {
      key: "user-conta",
      label: t("cat.conta"),
      icon: User,
      items: [
        { name: t("item.meuPerfil"), href: "/meu-perfil", icon: User, routeName: "meu-perfil" },
      ],
    },
  ];
}

function buildSupervisorMenu(t: (key: string) => string): NavCategory[] {
  return [
    {
      key: "sup-administracao",
      label: t("cat.administracao"),
      icon: Shield,
      items: sortItems([
        { name: t("item.canais"), href: "/sessoes", icon: Server, routeName: "sessoes", tourId: "tour-sessoes" },
        { name: t("item.equipes"), href: "/equipes", icon: Users, routeName: "equipes", tourId: "tour-equipes" },
      ]),
    },
    {
      key: "sup-automacao",
      label: t("cat.automacao"),
      icon: Bot,
      items: sortItems([
        { name: t("item.agendamentos"), href: "/agendamentos", icon: Calendar, routeName: "agendamentos", tourId: "tour-agendamentos" },
        { name: t("item.aniversarios"), href: "/aniversarios", icon: Gift, routeName: "aniversarios", tourId: "tour-aniversarios" },
        { name: t("item.chatFlow"), href: "/chat-flow", icon: Workflow, routeName: "chat-flow", tourId: "tour-chatflow" },
        { name: t("item.instagramAutomacao"), href: "/instagram-automacao", icon: Instagram, routeName: "instagram-automacao" },
      ]),
    },
    {
      key: "sup-gestao-comercial",
      label: t("cat.gestaoComercial"),
      icon: BarChart3,
      items: [],
      subgroups: [
        {
          label: t("subgroup.operacao"),
          items: sortItems([
            { name: t("item.etiquetas"), href: "/etiquetas", icon: Tag, routeName: "etiquetas", tourId: "tour-etiquetas" },
            { name: t("item.fechamento"), href: "/fechamento", icon: AlertTriangle, routeName: "fechamento" },
            { name: t("item.motivosPausa"), href: "/motivos-pausa", icon: PauseCircle, routeName: "motivos-pausa" },
            { name: t("item.filas"), href: "/filas", icon: Inbox, routeName: "filas", tourId: "tour-filas" },
            { name: t("item.horarioAtendimento"), href: "/horario-atendimento", icon: Clock, routeName: "horarioAtendimento", tourId: "tour-horario" },
            { name: t("item.notas"), href: "/notas", icon: StickyNote, routeName: "notas" },
            { name: t("item.woocommerce"), href: "/woocommerce", icon: ShoppingBag, routeName: "woocommerce" },
            { name: t("item.nuvemshop"), href: "/nuvemshop", icon: ShoppingBag, routeName: "nuvemshop" },
            { name: t("item.catalogo"), href: "/catalogo", icon: Package, routeName: "catalogo" },
            { name: t("item.cobrancas"), href: "/cobrancas", icon: Receipt, routeName: "cobrancas" },
            { name: t("item.agendamentoPublico"), href: "/agendamento-publico", icon: CalendarClock, routeName: "agendamento-publico" },
          ]),
        },
        {
          label: t("subgroup.analiseRegistros"),
          items: sortItems([
            { name: t("item.avaliacoes"), href: "/avaliacoes", icon: Star, routeName: "avaliacoes", tourId: "tour-avaliacoes" },
            { name: t("item.protocolos"), href: "/protocolos", icon: FileText, routeName: "protocolos" },
            { name: t("item.relatorios"), href: "/relatorios", icon: BarChart3, routeName: "relatorios", tourId: "tour-relatorios" },
            { name: t("item.painelAtendimentos"), href: "/painel-atendimentos", icon: LayoutDashboard, routeName: "painel-atendimentos" },
          ]),
        },
      ],
    },
  ];
}

function buildAdminMenu(t: (key: string) => string): NavCategory[] {
  return [
    {
      key: "adm-administracao",
      label: t("cat.administracao"),
      icon: Shield,
      items: sortItems([
        { name: t("item.canais"), href: "/sessoes", icon: Server, routeName: "sessoes", tourId: "tour-sessoes" },
        { name: t("item.equipes"), href: "/equipes", icon: Users, routeName: "equipes", tourId: "tour-equipes" },
        { name: t("item.usuarios"), href: "/usuarios", icon: Users, routeName: "usuarios", tourId: "tour-usuarios" },
      ]),
    },
    {
      key: "adm-automacao",
      label: t("cat.automacao"),
      icon: Bot,
      items: sortItems([
        { name: t("item.agendamentos"), href: "/agendamentos", icon: Calendar, routeName: "agendamentos", tourId: "tour-agendamentos" },
        { name: t("item.aiAgents"), href: "/agentes-ia", icon: Bot, routeName: "agentes-ia", tourId: "tour-agentes-ia" },
        { name: t("item.aniversarios"), href: "/aniversarios", icon: Gift, routeName: "aniversarios", tourId: "tour-aniversarios" },
        { name: t("item.chatFlow"), href: "/chat-flow", icon: Workflow, routeName: "chat-flow", tourId: "tour-chatflow" },
        { name: t("item.instagramAutomacao"), href: "/instagram-automacao", icon: Instagram, routeName: "instagram-automacao" },
      ]),
    },
    {
      key: "adm-gestao-comercial",
      label: t("cat.gestaoComercial"),
      icon: BarChart3,
      items: [],
      subgroups: [
        {
          label: t("subgroup.operacao"),
          items: sortItems([
            { name: t("item.etiquetas"), href: "/etiquetas", icon: Tag, routeName: "etiquetas", tourId: "tour-etiquetas" },
            { name: t("item.fechamento"), href: "/fechamento", icon: AlertTriangle, routeName: "fechamento" },
            { name: t("item.motivosPausa"), href: "/motivos-pausa", icon: PauseCircle, routeName: "motivos-pausa" },
            { name: t("item.filas"), href: "/filas", icon: Inbox, routeName: "filas", tourId: "tour-filas" },
            { name: t("item.horarioAtendimento"), href: "/horario-atendimento", icon: Clock, routeName: "horarioAtendimento", tourId: "tour-horario" },
            { name: t("item.notas"), href: "/notas", icon: StickyNote, routeName: "notas" },
            { name: t("item.woocommerce"), href: "/woocommerce", icon: ShoppingBag, routeName: "woocommerce" },
            { name: t("item.nuvemshop"), href: "/nuvemshop", icon: ShoppingBag, routeName: "nuvemshop" },
            { name: t("item.catalogo"), href: "/catalogo", icon: Package, routeName: "catalogo" },
            { name: t("item.cobrancas"), href: "/cobrancas", icon: Receipt, routeName: "cobrancas" },
            { name: t("item.agendamentoPublico"), href: "/agendamento-publico", icon: CalendarClock, routeName: "agendamento-publico" },
          ]),
        },
        {
          label: t("subgroup.analiseRegistros"),
          items: sortItems([
            { name: t("item.avaliacoes"), href: "/avaliacoes", icon: Star, routeName: "avaliacoes", tourId: "tour-avaliacoes" },
            { name: t("item.logLigacoes"), href: "/logligacao", icon: PhoneCall, routeName: "logligacao" },
            { name: t("item.painelAtendimentos"), href: "/painel-atendimentos", icon: LayoutDashboard, routeName: "painel-atendimentos", tourId: "tour-painel" },
            { name: t("item.protocolos"), href: "/protocolos", icon: FileText, routeName: "protocolos" },
            { name: t("item.relatorios"), href: "/relatorios", icon: BarChart3, routeName: "relatorios", tourId: "tour-relatorios" },
            { name: t("item.wavoip"), href: "/wavoip", icon: Phone, routeName: "wavoip" },
          ]),
        },
      ],
    },
    {
      key: "adm-configuracao",
      label: t("cat.configuracao"),
      icon: Cog,
      items: sortItems([
        { name: t("item.api"), href: "/api-service", icon: Split, routeName: "api-service", tourId: "tour-api" },
        { name: t("item.auditLog"), href: "/audit-log", icon: ClipboardList, routeName: "audit-log", tourId: "tour-auditlog" },
        { name: t("item.configuracoes"), href: "/configuracoes", icon: Settings, routeName: "configuracoes", tourId: "tour-config" },
        // Só aparece com o gate dos Créditos de IA ligado (fail-closed em getProfileMenus).
        { name: t("item.aiCredits"), href: "/creditos-ia", icon: Coins, routeName: "creditos-ia" },
        { name: t("item.integracoesMeta"), href: "/integracoes-meta", icon: MessageCircle, routeName: "integracoes-meta", tourId: "tour-integracoes-meta" },
      ]),
    },
  ];
}

function buildSuperAdminMenu(t: (key: string) => string): NavCategory[] {
  return [
    {
      key: "sa-tenants",
      label: t("cat.tenantsLicenciamento"),
      icon: Building2,
      items: [],
      subgroups: [
        {
          label: t("subgroup.licenca"),
          items: sortItems([
            { name: t("item.assinatura"), href: "/assinatura", icon: CreditCard, routeName: "assinatura" },
          ]),
        },
        {
          label: t("subgroup.clientes"),
          items: sortItems([
            { name: t("item.tenants"), href: "/tenants", icon: Building2, routeName: "tenants" },
            { name: t("item.usuariosTenants"), href: "/usuariotenants", icon: Users, routeName: "usuariotenants" },
            { name: t("item.suporteChat"), href: "/suporte-chat", icon: Headphones, routeName: "suporteChat" },
          ]),
        },
        {
          label: t("subgroup.financeiro"),
          items: sortItems([
            { name: t("item.pagamentos"), href: "/pagamentostenants", icon: CreditCard, routeName: "pagamentostenants" },
            { name: t("item.planos"), href: "/planos", icon: CreditCard, routeName: "planos" },
            { name: t("item.aiPlatform"), href: "/ia-plataforma", icon: Sparkles, routeName: "iaPlataforma" },
          ]),
        },
      ],
    },
    {
      key: "sa-config",
      label: t("cat.configuracoes"),
      icon: Settings,
      items: sortItems([
        { name: t("item.customizar"), href: "/customizar", icon: Palette, routeName: "customizar" },
        { name: t("item.email"), href: "/configuracoesTenant", icon: Send, routeName: "configuracoesTenant" },
        { name: t("item.notificacao"), href: "/notificacao", icon: Bell, routeName: "notificacao" },
      ]),
    },
    {
      key: "sa-canais",
      label: t("cat.canaisIntegracoes"),
      icon: Server,
      items: [],
      subgroups: [
        {
          label: t("subgroup.canais"),
          items: sortItems([
            { name: t("item.canais"), href: "/sessoestenants", icon: Server, routeName: "sessoestenants" },
            { name: t("item.provedoresGlobais"), href: "/provedores-globais", icon: Globe, routeName: "provedoresGlobais" },
            { name: t("item.oauthDomain"), href: "/oauth-dominio", icon: Globe, routeName: "oauthDomain" },
            { name: t("item.api"), href: "/tenantApi", icon: Split, routeName: "tenantApi" },
          ]),
        },
        {
          label: t("subgroup.redesSociaisMarketplaces"),
          items: sortItems([
            { name: t("item.appLinkedIn"), href: "/app-linkedin", icon: Linkedin, routeName: "appLinkedIn" },
            { name: t("item.appMercadoLivre"), href: "/app-mercadolivre", icon: ShoppingBag, routeName: "appMercadoLivre" },
            { name: t("item.appOLX"), href: "/app-olx", icon: Tag, routeName: "appOLX" },
            // Phase 16 — oculto: App YouTube substituido por App Google. Rota mantida para compat legacy.
            // { name: t("item.appYouTube"), href: "/app-youtube", icon: Youtube, routeName: "appYouTube" },
            { name: t("item.appGoogle"), href: "/app-google", icon: Globe, routeName: "appGoogle" },
            { name: t("item.appTikTok"), href: "/app-tiktok", icon: Music2, routeName: "appTikTok" },
            { name: t("item.appRocketChat"), href: "/app-rocketchat", icon: MessageSquare, routeName: "appRocketChat" },
            { name: t("item.appWaba"), href: "/app-waba", icon: MessageSquare, routeName: "appWaba" },
            { name: t("item.appWooCommerce"), href: "/app-woocommerce", icon: ShoppingBag, routeName: "appWooCommerce" },
            { name: t("item.appNuvemshop"), href: "/app-nuvemshop", icon: ShoppingBag, routeName: "appNuvemshop" },
          ]),
        },
      ],
    },
    {
      key: "sa-sistema",
      label: t("cat.sistema"),
      icon: Monitor,
      items: [],
      subgroups: [
        {
          label: t("subgroup.operacao"),
          items: sortItems([
            { name: t("item.monitor"), href: "/monitor", icon: Monitor, routeName: "monitor" },
            { name: t("item.terminal"), href: "/terminal", icon: Monitor, routeName: "terminal" },
            { name: t("item.migracao"), href: "/migration", icon: RefreshCw, routeName: "migration" },
            { name: t("item.backup"), href: "/backup", icon: Database, routeName: "backup" },
          ]),
        },
        {
          label: t("subgroup.dadosConfig"),
          items: sortItems([
            { name: t("item.storageConfig"), href: "/storage-config", icon: HardDrive, routeName: "storageConfig" },
            { name: t("item.dadosInternos"), href: "/tenantsPk", icon: Database, routeName: "tenantsPk" },
            { name: t("item.auditLog"), href: "/audit-log", icon: ClipboardList, routeName: "audit-log" },
            { name: t("item.bancoDeDados"), href: "/banco-de-dados", icon: DatabaseZap, routeName: "bancoDeDados" },
          ]),
        },
      ],
    },
    {
      key: "sa-conta",
      label: t("cat.conta"),
      icon: User,
      items: [
        { name: t("item.meuPerfil"), href: "/perfil", icon: User, routeName: "perfil" },
      ],
    },
  ];
}

function getProfileMenus(profile: ProfileType, menuVisibility: Record<string, boolean>, t: (key: string) => string, isRestricted?: boolean, planFeatures?: PlanFeatures | null, wavoipEnabled?: boolean, tenantMenuVisibility?: Record<string, boolean> | null, aiCreditsVisible?: boolean): NavCategory[] {
  const isVisible = (routeName?: string) => {
    if (!routeName) return true;
    // Teto do TENANT (AND): para user/super/custom o `menuVisibility` abaixo é o
    // menuPermissions do próprio usuário (sobrescrito no boot/refresh do layout),
    // então o que o superadmin desligou em /tenants só sobrevive neste mapa.
    if (tenantMenuVisibility && isMenuRouteHidden(tenantMenuVisibility, routeName)) return false;
 // Front legado — restrictedUser oculta o menu de contatos
    if (routeName === "contatos" && isRestricted) return false;
    // Interruptor do WaVoIP no tenant (isWavoipEnabled = plano + Tenant.wavoipEnabled).
    // `undefined` = chamador antigo que não passa o gate → não esconde nada.
    if (routeName === "wavoip" && wavoipEnabled === false) return false;
    // Créditos de IA: polaridade INVERTIDA em relação ao WaVoIP — FAIL-CLOSED. Só
    // `true` explícito mostra o item; `undefined` (chamador que não passa o gate)
    // esconde. O valor vem de useAiCreditsNavVisible() (recurso ligado no tenant +
    // quem pode gerenciar), então user/super e tenant sem o recurso nunca veem o item.
    if (routeName === "creditos-ia" && aiCreditsVisible !== true) return false;
    // O PLANO é o teto: rota de capability não contratada some do menu, independente
    // de menuVisibility/permissão. Plano ausente => libera (grandfathering). AND com o resto.
    if (!planAllowsRoute(planFeatures, routeName)) return false;
    // Esconde se a chave OU o seu alias (2 grafias) estiver false — mesma lógica do
    // guard de rotas (lib/menu-visibility), para o toggle do perfil custom valer nos dois.
    if (isMenuRouteHidden(menuVisibility, routeName)) return false;
    return true;
  };

  const filterCategory = (cat: NavCategory): NavCategory => ({
    ...cat,
    items: cat.items.filter((item) => isVisible(item.routeName)),
    subgroups: cat.subgroups?.map((sg) => ({
      ...sg,
      items: sg.items.filter((item) => isVisible(item.routeName)),
    })).filter((sg) => sg.items.length > 0),
  });

  const hasVisibleItems = (cat: NavCategory): boolean => {
    if (cat.subgroups) return cat.subgroups.some((sg) => sg.items.length > 0);
    return cat.items.length > 0;
  };

  const dashboard: NavItem = { name: t("item.dashboard"), href: "/dashboard", icon: LayoutDashboard, routeName: "dashboard", tourId: "tour-dashboard" };

  let categories: NavCategory[] = [];

  switch (profile) {
    case "superadmin":
      categories = buildSuperAdminMenu(t);
      break;
    case "admin":
    case "custom":
      // custom: monta union user+admin para que TODOS os itens controláveis via
      // CustomProfile.menuPermissions estejam presentes no menu. O filtro abaixo
      // (menuVisibility[routeName] !== false) esconde o que o template marcou
      // como false. use-page-access.ts:65-75 garante o gate de acesso real.
      categories = [
        ...buildUserMenu(t),
        ...buildAdminMenu(t),
      ];
      break;
    case "super":
      categories = [
        ...buildUserMenu(t),
        ...buildSupervisorMenu(t),
      ];
      break;
    default:
      categories = buildUserMenu(t);
      break;
  }

  const filtered = categories
    .map(filterCategory)
    .filter(hasVisibleItems);

  if (profile === "superadmin") {
    return filtered;
  }

  const dashCategory: NavCategory = {
    key: "principal",
    label: t("cat.principal"),
    icon: Compass,
    defaultOpen: true,
    items: [
      { name: t("item.home"), href: "/", icon: Home, routeName: "home" },
      dashboard,
    ],
  };

  // Ensure "conta" category is always last for admin/super profiles
  const contaCat = filtered.find((c) => c.key === "user-conta");
  const otherCats = filtered.filter((c) => c.key !== "user-conta");
  return [dashCategory, ...otherCats, ...(contaCat ? [contaCat] : [])];
}

export interface BuildNavEntriesArgs {
  profile: ProfileType;
  menuVisibility: Record<string, boolean>;
  /** Tradutor do namespace "layoutSidebar". */
  t: (key: string) => string;
  isRestricted?: boolean;
  planFeatures?: PlanFeatures | null;
  paymentOverdue?: boolean;
  /** canViewPayments() do auth-store — LGPD: sem acesso a pagamentos, não vê o lockdown. */
  showPayments?: boolean;
  /** Troca de senha obrigatória: nav vazia (beco-sem-saída em /trocar-senha). */
  mustChangePassword?: boolean;
  /** Termos do revendedor pendentes (só admin): nav vazia (beco-sem-saída em /aceite-termos). */
  resellerTermsPending?: boolean;
  /** isWavoipEnabled() do auth-store: plano + interruptor Tenant.wavoipEnabled. */
  wavoipEnabled?: boolean;
  /** Teto do tenant (auth-store.tenantMenuVisibility). Ausente = sem teto (chamador antigo). */
  tenantMenuVisibility?: Record<string, boolean>;
  /** useAiCreditsNavVisible(). FAIL-CLOSED: ausente ou false = item "Créditos de IA" oculto. */
  aiCreditsVisible?: boolean;
}

/**
 * Gate do item "Créditos de IA" na navegação (sidebar E command palette — mesma fonte,
 * para os dois nunca divergirem). Recurso ligado no tenant (plano AND interruptor,
 * fail-closed) AND quem pode gerenciar (admin, ou custom com `ai_credits_manage`).
 * Para o perfil custom exige também a chave de menu marcada no template — é a MESMA
 * leitura do usePageAccess (`=== true`), então o item nunca aponta para "acesso negado".
 */
export function useAiCreditsNavVisible(): boolean {
  return useAuthStore((s) => {
    if (!s.isAiCreditsEnabled() || !s.canManageAiCredits()) return false;
    if (s.user?.profile === "custom") {
      const perms = (s.user.customProfile?.menuPermissions as Record<string, boolean> | undefined) || {};
      return perms["creditos-ia"] === true;
    }
    return true;
  });
}

/**
 * P0-9 — Builder ÚNICO de navegação. Produz a lista de categorias/itens JÁ
 * FILTRADA por TODOS os gates da sidebar: planAllowsRoute (plano é o teto),
 * isMenuRouteHidden (alias-aware, vale p/ perfil custom), restrictedUser
 * (esconde contatos), união user+admin para o perfil custom, e o lockdown de
 * pagamento atrasado (Front legado — somente a rota de
 * regularização). Consumido pela Sidebar E pelo CommandPalette — qualquer
 * mudança de gate aqui vale automaticamente para os dois (paridade de listagem).
 */
export function buildNavEntriesForProfile({
  profile,
  menuVisibility,
  t,
  isRestricted,
  planFeatures,
  paymentOverdue,
  showPayments,
  mustChangePassword,
  resellerTermsPending,
  wavoipEnabled,
  tenantMenuVisibility,
  aiCreditsVisible,
}: BuildNavEntriesArgs): NavCategory[] {
  // Troca de senha obrigatória: sem menu nenhum — o guard prende em /trocar-senha
  // e o backend nega todo o resto com 403; itens de nav seriam só ruído.
  if (mustChangePassword && profile !== "superadmin") {
    return [];
  }
 // Front legado — se houver pagamento OVERDUE, exibe apenas link de pagamento.
  // LGPD: usuários comuns sem acesso a pagamentos não veem essa lockdown — mantêm a nav
  // normal; o backend bloqueia operações com 402 quando aplicável.
  if (paymentOverdue && showPayments) {
    return [{
      key: "payment",
      label: t("paymentOverdueCategory"),
      icon: CreditCard,
      items: [{ name: t("paymentOverdueItem"), href: "/configuracoesPagamentoAtrasado", icon: CreditCard }],
      defaultOpen: true,
    }];
  }
  // Termos do revendedor pendentes: sem menu — o guard prende em /aceite-termos e
  // o backend nega o resto com 403. Fica DEPOIS da inadimplência (ordem
  // pagamento → senha → termos: o link de pagamento continua visível).
  if (resellerTermsPending && profile === "admin") {
    return [];
  }
  return getProfileMenus(profile, menuVisibility, t, isRestricted, profile === "superadmin" ? null : planFeatures, wavoipEnabled, profile === "superadmin" ? null : tenantMenuVisibility, aiCreditsVisible);
}

/**
 * Fluxo compartilhado de logout (Sidebar footer, UserMenu do header e ação
 * "Sair" do CommandPalette): opcionalmente marca o usuário como offline
 * (best-effort) e limpa a sessão. O diálogo de confirmação (manter online /
 * ficar offline) fica a cargo do chamador.
 */
export async function performLogout(setOffline: boolean): Promise<void> {
  const { user, clearAuth } = useAuthStore.getState();
  if (setOffline && user?.userId) {
    try { await updateUserIsOnline(user.userId, false); } catch { /* ignora — sai mesmo assim */ }
  }
  // Web Push (PWA): desfaz a assinatura deste aparelho para quem saiu parar de
  // receber avisos aqui. Best-effort com teto de 3s — sair nunca trava.
  await unsubscribePush();
  clearAuth();
  window.location.href = "/login";
}

export function Sidebar() {
  const t = useTranslations("layoutSidebar");
  // Reuso de chaves existentes: "openMenu" (header) nomeia o drawer mobile e
  // "channelDisconnected" (sessões) rotula o dot de incidente da sidebar colapsada.
  const tHeader = useTranslations("layoutHeader");
  const tSessoes = useTranslations("sessoesPage");
  const pathname = usePathname();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { logoTimestamp, appName, tenantBranding } = useBrandingStore();
  const { showButton: showPwaButton, canPromptInstall, canOpenApp, install: installPWA, showIOSInstructions, setShowIOSInstructions } = useInstallPWA();
  const { sidebarCollapsed, setSidebarCollapsed, mobileSidebarOpen, setMobileSidebarOpen, tourActive } = useUIStore();
  const { user, menuVisibility, tenantMenuVisibility, isRestrictedUser, paymentOverdue, canViewPayments, planFeatures } = useAuthStore();
  const wavoipEnabled = useAuthStore((s) => s.isWavoipEnabled());
  const aiCreditsVisible = useAiCreditsNavVisible();

  const effectiveTenantId =tenantBranding && tenantBranding.customLogoTimestamp > 0 ? tenantBranding.tenantId : undefined;
  const effectiveLogoTs = tenantBranding?.customLogoTimestamp || logoTimestamp;
  const effectiveLogoDarkTs = tenantBranding?.customLogoDarkTimestamp || logoTimestamp;
  const logoUrl     = getLogoUrl(effectiveLogoTs || undefined, effectiveTenantId);
  const logoDarkUrl = getLogoDarkUrl(effectiveLogoDarkTs || undefined, tenantBranding && tenantBranding.customLogoDarkTimestamp > 0 ? tenantBranding.tenantId : undefined);

  // Logout dialog (escolha entre manter online ou ficar offline)
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const confirmLogout = async (setOffline: boolean) => {
    setLoggingOut(true);
    await performLogout(setOffline);
  };

  // Collapsed sidebar: which categories are expanded
  const [collapsedOpenKeys, setCollapsedOpenKeys] = useState<Set<string>>(new Set());
  const toggleCollapsedKey = (key: string) =>
    setCollapsedOpenKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // Bull-Board (painel de filas Redis): só superadmin, e só se o backend reportar
  // disponível (REDIS_MODE on + BULL_BOARD_USER/PASS definidos). O item é um link
  // externo p/ o painel server-rendered (basic-auth própria), aberto em nova aba.
  const [bullBoard, setBullBoard] = useState<{ enabled: boolean; url: string }>({ enabled: false, url: "" });
  useEffect(() => {
    if ((user?.profile || "") !== "superadmin") return;
    let alive = true;
    getBullBoardStatus()
      .then((s) => { if (alive) setBullBoard(s); })
      .catch(() => { /* endpoint ausente/erro — simplesmente não exibe o item */ });
    return () => { alive = false; };
  }, [user?.profile]);

  // Session counts for badge
  const [sessionCounts, setSessionCounts] = useState<{online: number; total: number}>({ online: 0, total: 0 });

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) setSessionCounts(detail);
    };
    window.addEventListener("sessionsStatusUpdate", handler as EventListener);
    return () => window.removeEventListener("sessionsStatusUpdate", handler as EventListener);
  }, []);

  // Superadmin sessions counts for badge
  const [sessionTenantCounts, setSessionTenantCounts] = useState<{online: number; total: number}>({ online: 0, total: 0 });

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) setSessionTenantCounts(detail);
    };
    window.addEventListener("sessionsTenantStatusUpdate", handler as EventListener);
    return () => window.removeEventListener("sessionsTenantStatusUpdate", handler as EventListener);
  }, []);

  // Users counts for badge
  const [userCounts, setUserCounts] = useState<{online: number; total: number}>({ online: 0, total: 0 });
  const [userTenantCounts, setUserTenantCounts] = useState<{total: number}>({ total: 0 });

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) setUserCounts(detail);
    };
    window.addEventListener("usersStatusUpdate", handler as EventListener);
    return () => window.removeEventListener("usersStatusUpdate", handler as EventListener);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) setUserTenantCounts(detail);
    };
    window.addEventListener("userTenantsStatusUpdate", handler as EventListener);
    return () => window.removeEventListener("userTenantsStatusUpdate", handler as EventListener);
  }, []);

  // Close mobile sidebar on navigation
  React.useEffect(() => {
    setMobileSidebarOpen(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Drawer mobile — a11y: painel focável + devolução de foco ao acionador (hamburger)
  const panelRef = React.useRef<HTMLElement | null>(null);
  const prevFocusRef = React.useRef<HTMLElement | null>(null);

  // Escape fecha o drawer mobile (listener só enquanto aberto, com cleanup)
  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      // Se um overlay interno (ex.: dialog de logout) já tratou o Esc, não fecha o drawer junto
      if (e.defaultPrevented) return;
      if (e.key === "Escape") setMobileSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileSidebarOpen, setMobileSidebarOpen]);

  // Ao abrir, foco vai para o painel (tabIndex -1); ao fechar, volta para quem
  // abriu (o hamburger do header) — guardado em ref no momento da abertura.
  useEffect(() => {
    if (mobileSidebarOpen) {
      prevFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
      panelRef.current?.focus();
    } else if (prevFocusRef.current) {
      if (document.contains(prevFocusRef.current)) prevFocusRef.current.focus();
      prevFocusRef.current = null;
    }
  }, [mobileSidebarOpen]);

  const profile = (user?.profile || "user") as ProfileType;
  const isRestricted = isRestrictedUser();
  const showPayments = canViewPayments();

  const navCategories = useMemo(() => {
    // Builder único (P0-9): gates + lockdown de pagamento compartilhados com o CommandPalette.
    const cats = buildNavEntriesForProfile({
      profile,
      menuVisibility: menuVisibility || {},
      t,
      isRestricted,
      planFeatures,
      paymentOverdue,
      showPayments,
      mustChangePassword: !!user?.mustChangePassword,
      resellerTermsPending: !!user?.resellerTermsPending,
      wavoipEnabled,
      tenantMenuVisibility: tenantMenuVisibility || {},
      aiCreditsVisible,
    });
    // Bull-Board: injeta o atalho (link externo, nova aba) no subgrupo Operação
    // do menu Sistema do superadmin, só quando o backend reporta disponível.
    // (Sob lockdown de pagamento não existe "sa-sistema" → find abaixo é no-op.)
    if (profile === "superadmin" && bullBoard.enabled && bullBoard.url) {
      const sistema = cats.find((c) => c.key === "sa-sistema");
      const operacao = sistema?.subgroups?.find((sg) => sg.label === t("subgroup.operacao"));
      if (operacao && !operacao.items.some((i) => i.external)) {
        operacao.items = [
          ...operacao.items,
          { name: t("item.bullBoard"), href: bullBoard.url, icon: ListChecks, external: true },
        ];
      }
    }
    return cats;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, menuVisibility, tenantMenuVisibility, isRestricted, paymentOverdue, showPayments, planFeatures, bullBoard.enabled, bullBoard.url, user?.mustChangePassword, user?.resellerTermsPending, wavoipEnabled, aiCreditsVisible]);

  // During tour: expand all collapsed-sidebar categories so items are in the DOM
  useEffect(() => {
    if (tourActive) {
      setCollapsedOpenKeys(new Set(navCategories.map((c) => c.key)));
    }
  }, [tourActive, navCategories]);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <TooltipProvider delayDuration={0}>
      {/* Mobile backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      <motion.aside
        ref={panelRef}
        tabIndex={-1}
        // Semântica de dialog só enquanto atua como drawer mobile; no desktop
        // permanece um <aside> (landmark complementar) comum.
        role={mobileSidebarOpen ? "dialog" : undefined}
        aria-modal={mobileSidebarOpen ? true : undefined}
        aria-label={tHeader("openMenu")}
        initial={false}
        animate={{ width: sidebarCollapsed ? 68 : 256 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className={cn(
          "fixed left-0 top-0 z-40 flex h-dvh flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground pt-[env(safe-area-inset-top)]",
          "transition-transform duration-300 ease-in-out md:transition-none",
          "focus:outline-none focus-visible:outline-none",
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        {/* Logo */}
        <div className={cn(
          "flex items-center",
          sidebarCollapsed
            ? "h-auto flex-col justify-center gap-1 px-1 py-2"
            : "h-14 justify-between px-4"
        )}>
          <AnimatePresence mode="wait">
            {!sidebarCollapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center"
              >
                <Link href="/">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolvedTheme === "dark" ? logoDarkUrl : logoUrl}
                    alt="Logo"
                    className="h-8 max-w-[130px] object-contain"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      img.style.display = "none";
                      if (img.nextElementSibling) (img.nextElementSibling as HTMLElement).style.display = "flex";
                    }}
                  />
                  {/* Fallback texto caso a imagem não exista */}
                  <span className="hidden font-semibold text-sm">{appName || "APP"}</span>
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>

        <Separator />

        {/* Navigation */}
        <ScrollArea className="flex-1 px-2 py-2">
          <nav className="space-y-0">
            {navCategories.map((category, idx) => {
              const CatIcon = category.icon;
              const colors = getCategoryColors(category.key);

              if (sidebarCollapsed) {
                const isOpen = collapsedOpenKeys.has(category.key);
                const collapsedItems = category.subgroups ? category.subgroups.flatMap(sg => sg.items) : category.items;
                // Dot agregado de incidente: os badges detalhados (n/n de /sessoes) só
                // existem na sidebar expandida — colapsada, a categoria que contém
                // /sessoes ganha um ponto destructive no canto do ícone quando TODOS
                // os canais estão fora do ar (online === 0 && total > 0). Mesma fonte
                // de dados do badge expandido (sessionCounts via sessionsStatusUpdate).
                const hasChannelsIncident =
                  sessionCounts.total > 0 &&
                  sessionCounts.online === 0 &&
                  collapsedItems.some((i) => i.href === "/sessoes");
                return (
                  <div key={category.key} className={cn("space-y-0.5", idx > 0 && "mt-2 pt-2 border-t border-sidebar-border/50")}>
                    {/* Category icon — click to expand/collapse */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => toggleCollapsedKey(category.key)}
                          aria-expanded={isOpen}
                          className={cn(
                            "flex h-7 w-full items-center justify-center rounded-md transition-colors",
                            isOpen
                              ? "text-sidebar-foreground/95"
                              : "text-sidebar-foreground/55 hover:text-sidebar-foreground/85"
                          )}
                        >
                          <span className="relative inline-flex">
                            <CatIcon className={cn("h-3.5 w-3.5", isOpen && colors.icon)} />
                            {hasChannelsIncident && (
                              <span
                                role="img"
                                aria-label={tSessoes("channelDisconnected")}
                                title={tSessoes("channelDisconnected")}
                                className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-destructive"
                              />
                            )}
                          </span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {category.label} {isOpen ? "▲" : "▼"}
                      </TooltipContent>
                    </Tooltip>
                    {/* Items — only shown when section is open */}
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.15 }}
                          className="space-y-0.5 overflow-hidden"
                        >
                          {collapsedItems.map((item) => {
                            const Icon = item.icon;
                            const active = isActive(item.href);
                            return (
                              <Tooltip key={item.href}>
                                <TooltipTrigger asChild>
                                  <Link
                                    href={item.href}
                                    aria-current={active ? "page" : undefined}
                                    {...(item.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                                    {...(item.tourId ? { id: item.tourId } : {})}
                                    className={cn(
                                      "flex h-9 w-full items-center justify-center rounded-md transition-colors",
                                      active
                                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                        : "text-sidebar-foreground/78 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                                    )}
                                  >
                                    {/* Ativo: ícone herda text-sidebar-accent-foreground (contraste por luminância
                                        de brand-colors.ts) em vez da cor fixa da categoria — evita ícone amber sobre
                                        fundo accent claro (baixo contraste). */}
                                    <Icon className="h-4 w-4" />
                                  </Link>
                                </TooltipTrigger>
                                <TooltipContent side="right">{item.name}</TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              }

              // Auto-expande a categoria que contém a rota ativa (deep-link/F5):
              // defaultOpen só vale no mount, então o remount via key `${category.key}-${tourActive}` segue intacto.
              const hasActiveItem = (category.subgroups ? category.subgroups.flatMap((sg) => sg.items) : category.items).some((item) => isActive(item.href));

              return (
                <Collapsible key={`${category.key}-${tourActive}`} defaultOpen={tourActive || category.defaultOpen === true || hasActiveItem} className={cn(idx > 0 && "mt-3 pt-2 border-t border-sidebar-border/50")}>
                  {/* Cabeçalho de categoria (menu): sem ícone, com fundo + barra na cor da
                      categoria — diferencia visualmente dos itens (submenus), que mantêm ícone. */}
                  <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-md bg-sidebar-foreground/5 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/80 transition-colors hover:bg-sidebar-foreground/10 hover:text-sidebar-foreground/95">
                    <span className={cn("h-3.5 w-1 shrink-0 rounded-full", colors.dot)} />
                    <span className="flex-1 text-left">{category.label}</span>
                    <ChevronRight className="h-3 w-3 transition-transform duration-200 group-data-[state=open]:rotate-90 opacity-50" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-1 mt-0.5">
                      {(() => {
                        const renderItem = (item: NavItem) => {
                          const Icon = item.icon;
                          const active = isActive(item.href);
                          const itemName = item.nameKey ? t(item.nameKey) : item.name;
                          return (
                            <div key={item.href} className="relative">
                              {active && (
                                <div className={cn("absolute left-0 top-1 bottom-1 w-0.5 rounded-full", colors.dot)} />
                              )}
                              <Link
                                href={item.href}
                                aria-current={active ? "page" : undefined}
                                {...(item.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                                {...(item.tourId ? { id: item.tourId } : {})}
                                className={cn(
                                  "flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors duration-150",
                                  active
                                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium pl-3 shadow-xs"
                                    : "text-sidebar-foreground/78 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                                )}
                              >
                                {/* Ativo: ícone herda text-sidebar-accent-foreground (contraste por luminância
                                    de brand-colors.ts) em vez da cor fixa da categoria — evita ícone amber sobre
                                    fundo accent claro (baixo contraste). */}
                                <Icon className="h-4 w-4 shrink-0" />
                                <span className="truncate">{itemName}</span>
                                {item.href === "/sessoes" && sessionCounts.total > 0 && (
                                  <span className={cn(
                                    "ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center",
                                    sessionCounts.online > 0
                                      ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                      : "bg-red-500/20 text-red-600 dark:text-red-400"
                                  )}>
                                    {sessionCounts.online}/{sessionCounts.total}
                                  </span>
                                )}
                                {item.href === "/usuarios" && userCounts.total > 0 && (
                                  <span className={cn(
                                    "ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center",
                                    userCounts.online > 0
                                      ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                      : "bg-zinc-500/20 text-zinc-600 dark:text-zinc-400"
                                  )}>
                                    {userCounts.online}/{userCounts.total}
                                  </span>
                                )}
                                {item.href === "/sessoestenants" && sessionTenantCounts.total > 0 && (
                                  <span className={cn(
                                    "ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center",
                                    sessionTenantCounts.online > 0
                                      ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                      : "bg-red-500/20 text-red-600 dark:text-red-400"
                                  )}>
                                    {sessionTenantCounts.online}/{sessionTenantCounts.total}
                                  </span>
                                )}
                                {item.href === "/usuariotenants" && userTenantCounts.total > 0 && (
                                  <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center bg-zinc-500/20 text-zinc-600 dark:text-zinc-400">
                                    {userTenantCounts.total}
                                  </span>
                                )}
                              </Link>
                            </div>
                          );
                        };

                        if (category.subgroups) {
                          return category.subgroups.map((sg, sgIdx) => (
                            <div key={sgIdx} className={cn(sgIdx > 0 && "mt-2 pt-1.5 border-t border-sidebar-border/40")}>
                              <p className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                                {sg.label}
                              </p>
                              <div className="space-y-0.5">
                                {sg.items.map(renderItem)}
                              </div>
                            </div>
                          ));
                        }

                        return <div className="space-y-0.5">{category.items.map(renderItem)}</div>;
                      })()}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </nav>
        </ScrollArea>

        <Separator />

        {/* Footer */}
        <div className="p-2">
          {showPwaButton && (canPromptInstall || canOpenApp) && (
            <Button
              variant="ghost"
              size={sidebarCollapsed ? "icon" : "sm"}
              className={cn("w-full mb-1", !sidebarCollapsed && "justify-start gap-2")}
              onClick={canPromptInstall ? installPWA : undefined}
              title={canOpenApp ? t("pwaInstalled") : t("pwaInstall")}
            >
              {canOpenApp
                ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                : <Download className="h-4 w-4" />}
              {!sidebarCollapsed && (
                <span>{canOpenApp ? t("pwaInstalled") : t("pwaInstall")}</span>
              )}
            </Button>
          )}

          {/* Tema sem reload (P0-9/tarefa 6): o effect do DashboardLayout reaplica a
              paleta whitelabel no flip de resolvedTheme (applyBrandColors) — o reload
              com overlay era desnecessário. Validação whitelabel (3 cenários de paleta:
              só light / só dark / ambas + tela /customizar) é pós-deploy. */}
          <Button
            variant="ghost"
            size={sidebarCollapsed ? "icon" : "sm"}
            className={cn("w-full", !sidebarCollapsed && "justify-start gap-2")}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {!sidebarCollapsed && <span>{theme === "dark" ? t("lightMode") : t("darkMode")}</span>}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={cn("w-full mt-1", sidebarCollapsed ? "h-9 w-9 p-0" : "h-10 justify-start gap-2 px-2")}
              >
                <Avatar className="h-7 w-7">
                  <AvatarImage src={user?.profilePicture || ""} alt={user?.username} />
                  <AvatarFallback className="text-xs">{getInitials(user?.username || "U")}</AvatarFallback>
                </Avatar>
                {!sidebarCollapsed && (
                  <div className="flex flex-col items-start text-left">
                    <span className="text-xs font-medium truncate max-w-[160px]">{user?.username}</span>
                    <span className="text-[10px] text-muted-foreground capitalize">{user?.profile}</span>
                  </div>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuItem asChild>
                <Link href={profile === "superadmin" ? "/perfil" : "/meu-perfil"}>
                  <User className="mr-2 h-4 w-4" /> {t("profile")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setLogoutDialogOpen(true)}
              >
                <LogOut className="mr-2 h-4 w-4" /> {t("logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </motion.aside>

      {/* Modal iOS PWA */}
      {showIOSInstructions && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
          onClick={() => setShowIOSInstructions(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-background p-6 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold">{t("pwaIosTitle")}</h3>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowIOSInstructions(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ol className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">1</span>{t("pwaIosStep1")}</li>
              <li className="flex items-start gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">2</span>{t("pwaIosStep2")}</li>
              <li className="flex items-start gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">3</span>{t("pwaIosStep3")}</li>
            </ol>
            <Button className="mt-5 w-full" onClick={() => setShowIOSInstructions(false)}>
              {t("pwaClose")}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={logoutDialogOpen} onOpenChange={(o) => { if (!loggingOut) setLogoutDialogOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogOut className="h-5 w-5" /> {t("logoutDialogTitle")}
            </DialogTitle>
            <DialogDescription>{t("logoutDialogDesc")}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" disabled={loggingOut} onClick={() => confirmLogout(false)}>
              <CircleDot className="mr-2 h-4 w-4 text-emerald-500" />
              {t("logoutKeepOnline")}
            </Button>
            <Button variant="destructive" disabled={loggingOut} onClick={() => confirmLogout(true)}>
              <CircleDot className="mr-2 h-4 w-4" />
              {t("logoutSetOffline")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
