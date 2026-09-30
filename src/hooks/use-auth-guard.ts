"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { isMenuRouteHidden } from "@/lib/menu-visibility";

const PUBLIC_ROUTES = ["/login", "/signup", "/reset", "/masterkey", "/validate-a2f"];

// Mapeamento pathname → routeName (igual ao front legado router/index.js:70 — menuVisibility[to.name])
const PATHNAME_TO_ROUTE_NAME: Record<string, string> = {
  "/atendimento": "atendimento",
  "/contatos": "contatos",
  "/chat-privado": "chat-privado",
  "/campanhas": "campanhas",
  "/email-marketing": "email-marketing",
  "/agentes-ia": "agentes-ia",
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
  // /agenda usa a chave própria — o mapeamento legado para "kanban" fazia o
  // interruptor Kanban (painel do tenant ou permissão do usuário) bloquear o
  // link direto do Agenda mesmo com o item visível na sidebar (chave "agenda").
  "/agenda": "agenda",
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
  "/creditos-ia": "creditos-ia",
};

/**
 * Perfil do contato. Não exige a chave de menu `contatos` nem o teto do tenant — o
 * acesso é decidido pelo backend; usuário restrito é barrado pela própria página.
 * A lista `/contatos` continua casando a chave normalmente.
 */
const CONTACT_PROFILE_ROUTE = /^\/contatos\/[^/]+$/;

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
  "/banco-de-dados",
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
  "/ia-plataforma",
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
  "/agentes-ia",
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
  "/creditos-ia",
];

export function useAuthGuard() {
  const t = useTranslations("useAuthGuard");
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user, menuVisibility, tenantMenuVisibility, paymentOverdue, billingState, isWavoipEnabled, tenantConfigsLoaded, isAiCreditsEnabled, canManageAiCredits } = useAuthStore();

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

    // Termos do revendedor pendentes (só admin) — prende em /aceite-termos. O
    // backend nega o resto com 403 ERR_RESELLER_TERMS_PENDING (interceptor do
    // api.ts). Ordem pagamento → senha → termos: com inadimplência ou senha
    // pendente este bloco não roda, senão a flag persistida faria vaivém entre
    // as páginas de bloqueio (o backend também não cobra termos nesses estados).
    if (user?.resellerTermsPending && profile === "admin" && !isBlocked && !user?.mustChangePassword) {
      if (pathname !== "/aceite-termos") {
        router.replace("/aceite-termos");
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

 // Front legado router/index.js:62-75 — bloqueia rotas com menuVisibility[routeName] === false (exceto superadmin).
    // isMenuRouteHidden também checa o alias (2 grafias) — mesma lógica da sidebar (lib/menu-visibility),
    // p/ o toggle do perfil custom (ex.: woocommerce-produtos) bloquear a URL direta, não só esconder o menu.
    if (profile !== "superadmin" && menuVisibility) {
      // Fallback por prefixo: o prefixo MAIS LONGO vence — sem o sort, uma futura
      // subrota /agendamento-publico/x casaria "/agenda" (chave de outra feature).
      // Perfil do contato (/contatos/<id>) fica fora do menu e do teto do tenant:
      // quem decide o acesso é o backend (carteira ou atendimento que o usuário abre).
      const routeName = CONTACT_PROFILE_ROUTE.test(pathname)
        ? undefined
        : PATHNAME_TO_ROUTE_NAME[pathname] ??
          Object.entries(PATHNAME_TO_ROUTE_NAME)
            .sort(([a], [b]) => b.length - a.length)
            .find(([path]) => pathname.startsWith(path))?.[1];

      if (routeName && isMenuRouteHidden(menuVisibility, routeName)) {
        toast.error(t("accessDenied"));
        router.replace("/");
        return;
      }

      // Teto do TENANT: para user/super/custom o `menuVisibility` acima é o
      // menuPermissions do próprio usuário (sobrescrito no boot/refresh do
      // layout) — o que o superadmin desligou em /tenants só vive neste mapa.
      if (routeName && isMenuRouteHidden(tenantMenuVisibility || {}, routeName)) {
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

      // Créditos de IA: recurso ligado no tenant (plano + interruptor, FAIL-CLOSED) e
      // perfil que pode gerenciar (admin, ou custom com a permissão). Só decide depois
      // da carga do tenant: antes dela o gate é sempre false e redirecionar aqui
      // perderia o `?topup=` de quem volta do pagamento. Nesse intervalo a própria
      // página mostra acesso negado e não faz request nenhum.
      if (routeName === "creditos-ia" && tenantConfigsLoaded && !(isAiCreditsEnabled() && canManageAiCredits())) {
        toast.error(t("accessDenied"));
        router.replace("/");
        return;
      }
    }
  }, [isAuthenticated, pathname, router, user, menuVisibility, tenantMenuVisibility, paymentOverdue, billingState, isWavoipEnabled, tenantConfigsLoaded, isAiCreditsEnabled, canManageAiCredits]);

  return { isAuthenticated };
}
