"use client";

import { useAuthStore } from "@/stores/auth-store";
import { safeJsonParse } from "@/lib/safe-json-parse";
import { planAllowsRoute } from "@/lib/plan-capabilities";
import { isMenuRouteHidden } from "@/lib/menu-visibility";

/**
 * Equivalente ao padrão `pageAllowed` do front legado.
 *
 * Três padrões do front legado espelhados:
 *
 * Padrão 1 — `v-if="(userProfile === 'admin' || (userProfile === 'super' && pageAllowed))"`
 *   → Usar `{ adminSuperOnly: true }`
 *   → admin: sempre permitido (menuVisibility)
 *   → super: só se menuPermissions[key] === true
 *   → user: SEMPRE bloqueado
 *
 * Padrão 2 — `v-if="(userProfile === 'admin' || pageAllowed)"`
 *   → Sem opções extras (default)
 *   → admin: sempre permitido (menuVisibility)
 *   → super/user: só se menuPermissions[key] === true
 *
 * Padrão 3 — `v-if="pageAllowed"` (sozinho)
 *   → contatos: `{ checkRestrictedUser: true }`
 *   → mensagens-rapidas: `{ allowIfNotSet: true }`
 *
 * Superadmin: sempre bloqueado em páginas de tenant (suas rotas não usam este hook).
 *
 * §35.9 Opção B: para `profile === 'custom'`, menuPermissions vem de `user.customProfile.menuPermissions`
 * (template RBAC), não de `user.menuPermissions` (que é do próprio user para admin/super/user).
 */
export function usePageAccess(
  permissionKey: string,
  options?: {
    adminSuperOnly?: boolean;
    allowIfNotSet?: boolean;
    checkRestrictedUser?: boolean;
    /**
     * Chaves de menu ALTERNATIVAS que também liberam a página (OR com a principal).
     * Existe porque algumas telas historicamente pedem a chave de outra área — Funil e
     * Agenda checavam `kanban` —, o que tornava a própria chave decorativa: marcá-la
     * mostrava o item na sidebar e entregava tela de acesso negado. Passar a chave
     * própria como principal e manter a antiga aqui corrige sem tirar acesso de
     * perfis que já foram salvos com a chave antiga. São SÓ alias legado de
     * CONCESSÃO (menuPermissions do usuário/perfil): o teto do TENANT não é
     * avaliado nelas — cada interruptor do painel governa apenas a própria página,
     * então desligar "kanban" em /tenants não derruba /agenda nem /funil.
     */
    alsoAccept?: string[];
  }
): boolean {
  const { user, menuVisibility, tenantMenuVisibility, planFeatures, isWavoipEnabled, isAiCreditsEnabled, canManageAiCredits } = useAuthStore();

  if (!user) return false;

  const profile = user.profile;

  // Superadmin não acessa páginas de tenant
  if (profile === "superadmin") return false;

  // O PLANO é o teto: se a página pertence a uma capability não contratada, bloqueia
  // o acesso (a UI mostra upsell). Plano ausente => libera (grandfathering). Entra como
  // fator AND acima das regras de menuVisibility/menuPermissions/customProfile abaixo.
  if (!planAllowsRoute(planFeatures, permissionKey)) return false;

  // Interruptor do WaVoIP no tenant (Tenant.wavoipEnabled), AND acima do plano.
  // Precisa ser explícito aqui porque as regras abaixo, para user/super/custom, leem
  // apenas menuPermissions do usuário — nunca o mapa do tenant.
  if (permissionKey === "wavoip" && !isWavoipEnabled()) return false;

  // Créditos de IA: mesmo molde, polaridade INVERTIDA — FAIL-CLOSED. Só "enabled"
  // explícito na carga do tenant libera (backend antigo não manda o campo), e só para
  // quem pode gerenciar: admin, ou custom com `ai_credits_manage`. `hasPermission`
  // sozinho devolveria true para super/user, que o backend recusa com 403.
  if (permissionKey === "creditos-ia" && !(isAiCreditsEnabled() && canManageAiCredits())) return false;

  // Teto do TENANT (interruptores de /tenants) na chave PRÓPRIA da página: para
  // user/super/custom os mapas abaixo são permissões do usuário e não preservam o
  // que o superadmin desligou — só este mapa preserva. Avaliado SÓ na principal de
  // propósito: as chaves de `alsoAccept` são alias legado de concessão, não página,
  // e submetê-las ao teto fazia desligar "kanban" no painel derrubar /agenda.
  if (isMenuRouteHidden(tenantMenuVisibility || {}, permissionKey)) return false;

  // Verifica restrictedUser antes de qualquer outra regra
  if (options?.checkRestrictedUser) {
    const r = user.restrictedUser;
    if (r === true || r === "enabled") return false;
  }

  // Padrão 1: user e custom sem perfil são SEMPRE bloqueados nesta categoria
  if (options?.adminSuperOnly && (profile === "user" || (profile === "custom" && !user.customProfileEnabled))) {
    return false;
  }

  // §35.13: custom sem perfil atribuído OU com flag desligada — bloquear TUDO (banner aparece)
  if (profile === "custom" && (!user.customProfileEnabled || !user.customProfileId)) {
    return false;
  }

  // Resolução por chave de menu, avaliada para a chave principal e, se necessário,
  // para as alternativas de `alsoAccept` (OR).
  const hasMenuKey = (key: string): boolean => {
    // §35.9 Opção B: fonte de menuPermissions para custom vem do template
    if (profile === "custom") {
      const perms = (user.customProfile?.menuPermissions as Record<string, boolean>) || {};
      if (options?.adminSuperOnly) {
        // custom só entra se tiver a chave true (equivalente a super no padrão 1)
        const val = perms[key];
        return val === true;
      }
      const val = perms[key];
      if (options?.allowIfNotSet) return val !== false;
      return val === true;
    }

    // Para perfis user e super: usa menuPermissions do usuário
    if (profile === "user" || profile === "super") {
      const menuPermissions: Record<string, boolean> =
        (user.menuPermissions as Record<string, boolean>) || {};

 // Fallback para localStorage (igual ao front legado)
      let perms = menuPermissions;
      if (typeof window !== "undefined" && Object.keys(perms).length === 0) {
        perms = safeJsonParse(localStorage.getItem("menuPermissions"), {});
      }

      const val = perms[key];

      if (options?.allowIfNotSet) {
        return val !== false;
      }
      return val === true;
    }

    // Para admin: usa menuVisibility do store (carregado do tenant/API)
    if (profile === "admin") {
      const val = menuVisibility[key];
      return val !== false;
    }

    // §35.9 / §7.3 fallback secure-by-default para perfis desconhecidos
    return false;
  };

  if (hasMenuKey(permissionKey)) return true;
  return (options?.alsoAccept ?? []).some(hasMenuKey);
}
