"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { isMenuRouteHidden } from "@/lib/menu-visibility";

const PUBLIC_ROUTES = ["/login", "/signup", "/reset", "/masterkey", "/validate-a2f"];

// Mapeamento pathname → routeName (igual ao Vue router/index.js:70 — menuVisibility[to.name])
const PATHNAME_TO_ROUTE_NAME: Record<string, string> = {
  "/atendimento": "atendimento",
  "/contatos": "contatos",
  "/chat-privado": "chat-privado",
  "/campanhas": "campanhas",
  "/email-marketing": "email-marketing",
  "/massa": "massa",
  "/galeria": "galeria",
  "/grupo": "grupo",
  "/instagram-comentarios": "instagram-comentarios",
  "/instagram-automacao": "instagram-automacao",
  "/mensagens-rapidas": "mensagens-rapidas",
  "/funil": "funil",
  "/kanban": "kanban",
  "/tarefas": "tarefas",
  "/sessoes": "sessoes",
  "/equipes": "equipes",
  "/agendamentos": "agendamentos",
  "/chat-flow": "chat-flow",
  "/avaliacoes": "avaliacoes",
  "/etiquetas": "etiquetas",
  "/fechamento": "fechamento",
  "/filas": "filas",
  "/horario-atendimento": "horarioAtendimento",
  "/notas": "notas",
  "/protocolos": "protocolos",
  "/relatorios": "relatorios",
  "/usuarios": "usuarios",
  "/usuarios/perfis": "usuarios",
  "/logligacao": "logligacao",
  "/painel-atendimentos": "painel-atendimentos",
  "/wavoip": "wavoip",
  "/aniversarios": "aniversarios",
  "/dashboard": "dashboard",
  "/auto-resposta": "auto-resposta",
  "/audit-log": "audit-log",
  "/agenda": "kanban",
  "/facebook-comentarios": "facebookComentarios",
  "/instagram-mencoes": "instagramMencoes",
  "/tiktok-comentarios": "tiktokComentarios",
  "/youtube-comentarios": "youtubeComentarios",
  "/woocommerce-produtos": "woocommerce",
  "/woocommerce-pedidos": "woocommerce",
  "/woocommerce": "woocommerce",
  "/nuvemshop-produtos": "nuvemshop",
  "/nuvemshop-pedidos": "nuvemshop",
  "/nuvemshop": "nuvemshop",
  "/google-calendar": "google-calendar",
  "/motivos-pausa": "motivos-pausa",
  "/catalogo": "catalogo",
  "/cobrancas": "cobrancas",
  "/agendamento-publico": "agendamento-publico",
  "/chat-interno-rc": "chat-interno-rc",
};

/**
 * Rotas exclusivas do superadmin.
 * Outros perfis são redirecionados para /home ao tentar acessá-las.
 */
const SUPERADMIN_ONLY_ROUTES = [
  "/assinatura",
  "/planos",
  "/tenants",
  "/sessoestenants",
  "/pagamentostenants",
  "/tenantApi",
  "/tenants-pk",
  "/tenantsPk",
  "/terminal",
  "/customizar",
  "/monitor",
  "/usuariotenants",
  "/notificacao",
  "/configuracoesTenant",
  "/backup",
  "/migration",
  "/provedores-globais",
  "/app-waba",
  "/perfil", // superadmin profile page
  "/atualizar",
  "/tenantsQueue",
  "/storage-config",
  "/oauth-dominio",
  "/configuracoesbloqueio",
  "/suporte-chat",
  "/app-linkedin",
  "/app-mercadolivre",
  "/app-olx",
  "/app-rocketchat",
  "/app-tiktok",
  "/app-woocommerce",
  "/app-nuvemshop",
  "/app-youtube",
];

/**
 * Rotas de tenant (admin/super/user).
 * Superadmin é redirecionado para /assinatura ao tentar acessá-las.
 */
const TENANT_ONLY_ROUTES = [
  "/atendimento",
  "/contatos",
  "/chat-privado",
  "/campanhas",
  "/email-marketing",
  "/massa",
  "/galeria",
  "/grupo",
  "/instagram-comentarios",
  "/instagram-automacao",
  "/mensagens-rapidas",
  "/funil",
  "/kanban",
  "/tarefas",
  "/sessoes",
  "/equipes",
  "/agendamentos",
  "/aniversarios",
  "/chat-flow",
  "/avaliacoes",
  "/etiquetas",
  "/fechamento",
  "/filas",
  "/horario-atendimento",
  "/notas",
  "/protocolos",
  "/relatorios",
  "/usuarios",
  "/logligacao",
  "/painel-atendimentos",
  "/wavoip",
  "/dashboard",
  "/home",
  "/configuracoes",
  "/api-service",
  "/meu-perfil",
  "/auto-resposta",
  "/agenda",
  "/facebook-comentarios",
  "/instagram-mencoes",
  "/tiktok-comentarios",
  "/youtube-comentarios",
  "/woocommerce-produtos",
  "/woocommerce-pedidos",
  "/woocommerce",
  "/nuvemshop-produtos",
  "/nuvemshop-pedidos",
  "/nuvemshop",
  "/google-calendar",
];

export function useAuthGuard() {
  const t = useTranslations("useAuthGuard");
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user, menuVisibility, paymentOverdue, billingState, isWavoipEnabled } = useAuthStore();

  useEffect(() => {
    const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

    if (!isAuthenticated && !isPublicRoute) {
      router.replace("/login");
      return;
    }

    if (isAuthenticated && isPublicRoute) {
      const profile = user?.profile;
      if (profile === "superadmin") {
        router.replace("/assinatura");
      } else if (profile === "admin" || profile === "super") {
        router.replace("/");
      } else {
        router.replace("/atendimento");
      }
      return;
    }

    if (!isAuthenticated) return;

    const profile = user?.profile;

    // Tenant inadimplente — bloqueia navegação e força tela de pagamento.
    // paymentOverdue cobre o caso clássico; billingState='blocked' vem do backend
    // (tenant.paymentStatus='blocked' após reconciliação/webhook) e trava de forma
    // autoritativa mesmo que o cálculo local diga o contrário.
    const isBlocked = (paymentOverdue || billingState === "blocked") && profile !== "superadmin";
    if (isBlocked) {
      const allowed = pathname === "/configuracoesPagamentoAtrasado";
      if (!allowed) {
        router.replace("/configuracoesPagamentoAtrasado");
        return;
      }
    }

    // Troca de senha obrigatória (modo forceChange do tenant) — prende o usuário
    // em /trocar-senha até definir a nova senha. O backend também bloqueia tudo
    // via 403 ERR_MUST_CHANGE_PASSWORD (tratado no interceptor do api.ts).
    if (user?.mustChangePassword && profile !== "superadmin") {
      if (pathname !== "/trocar-senha") {
        router.replace("/trocar-senha");
        return;
      }
    }

    // Superadmin tenta acessar rota de tenant → redireciona para /assinatura
    if (profile === "superadmin") {
      const isTenantRoute = TENANT_ONLY_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));
      if (isTenantRoute) {
        router.replace("/assinatura");
        return;
      }
    }

    // Não-superadmin tenta acessar rota exclusiva do superadmin → redireciona para /home
    if (profile !== "superadmin") {
      const isSuperadminRoute = SUPERADMIN_ONLY_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));
      if (isSuperadminRoute) {
        toast.error(t("accessDenied"));
        router.replace("/");
        return;
      }
    }

    // Vue router/index.js:62-75 — bloqueia rotas com menuVisibility[routeName] === false (exceto superadmin).
    // isMenuRouteHidden também checa o alias (2 grafias) — mesma lógica da sidebar (lib/menu-visibility),
    // p/ o toggle do perfil custom (ex.: woocommerce-produtos) bloquear a URL direta, não só esconder o menu.
    if (profile !== "superadmin" && menuVisibility) {
      const routeName = PATHNAME_TO_ROUTE_NAME[pathname] ??
        Object.entries(PATHNAME_TO_ROUTE_NAME).find(([path]) => pathname.startsWith(path))?.[1];

      if (routeName && isMenuRouteHidden(menuVisibility, routeName)) {
        toast.error(t("accessDenied"));
        router.replace("/");
        return;
      }

      // Interruptor do WaVoIP no tenant (plano + Tenant.wavoipEnabled). Fica FORA do
      // menuVisibility de propósito: aquele mapa é sobrescrito pelo menuPermissions do
      // próprio usuário no refresh de 30s, então não serve de gate de tenant.
      if (routeName === "wavoip" && !isWavoipEnabled()) {
        toast.error(t("accessDenied"));
        router.replace("/");
        return;
      }
    }
  }, [isAuthenticated, pathname, router, user, menuVisibility, paymentOverdue, billingState, isWavoipEnabled]);

  return { isAuthenticated };
}
