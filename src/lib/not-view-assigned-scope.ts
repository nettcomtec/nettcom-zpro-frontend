/**
 * Quem a configuração "Não visualizar Tickets já atribuídos à outros usuários" impede de
 * abrir e de assumir o atendimento em andamento de outro atendente.
 *
 * Espelho de backend/src/helpers/NotViewAssignedScopeZPRO.ts (mudar um exige o outro):
 * atendente comum, supervisor com "Remover privilégios" (supervisorAdmin = "enabled") e
 * personalizado sem "Ver todos os atendimentos" (inclui o personalizado com o recurso
 * desligado na empresa). Admin, superadmin, supervisor com privilégio e personalizado
 * com "ver todos" seguem livres.
 *
 * Backend anterior a 16/10/2026 só barrava o atendente comum: lá o supervisor e o
 * personalizado continuam abrindo, e o botão escondido aqui só deixa de aparecer.
 */

interface ScopeUser {
  profile?: string | null;
  customProfileEnabled?: boolean | null;
  customProfile?: { customPermissions?: unknown } | null;
}

export function isNotViewAssignedRestricted(
  user: ScopeUser | null | undefined,
  supervisorAdmin: string | null | undefined
): boolean {
  const profile = user?.profile ?? "";
  if (profile === "user") return true;
  if (profile === "super") return supervisorAdmin === "enabled";
  if (profile === "custom") {
    const perms = user?.customProfile?.customPermissions as { tickets_view_all?: boolean } | null | undefined;
    return !(user?.customProfileEnabled === true && perms?.tickets_view_all === true);
  }
  return false;
}
