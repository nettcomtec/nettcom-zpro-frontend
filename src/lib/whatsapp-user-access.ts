import { useAuthStore } from "@/stores/auth-store";

/** Item mínimo que o filtro precisa: só o id do canal. */
interface WhatsappIdLike {
  id: number;
}

/** Subconjunto de UserData lido pelo filtro (perfil + canais liberados). */
interface UserAccessLike {
  profile?: string;
  whatsappAllowed?: unknown[];
}

/**
 * Restringe uma lista de canais (whatsapps) ao conjunto que o usuário logado
 * pode operar, espelhando EXATAMENTE o `availableWhatsapps` da tela de
 * Atendimento (atendimento/page.tsx). Usado nas telas de Envio em Massa para que
 * um usuário escopado por `whatsappAllowed` não veja/dispare por canais fora do
 * escopo dele — mantendo paridade com o que ele já enxerga no Atendimento.
 *
 * Regra (convenção da plataforma):
 *  - admin, ou super sem `supervisorAdmin` habilitado → enxerga TODOS os canais;
 *  - demais perfis → só os canais presentes em `whatsappAllowed`;
 *  - `whatsappAllowed` vazio/ausente → SEM restrição (enxerga todos).
 *
 * Filtro puramente VISUAL: o backend do bulk não reforça (decisão Pedro).
 */
export function filterWhatsappsByUserAccess<T extends WhatsappIdLike>(
  list: T[],
  user: UserAccessLike | null | undefined,
  supervisorAdmin: string
): T[] {
  const isAdminOrSuperAdmin =
    user?.profile === "admin" ||
    (user?.profile === "super" && supervisorAdmin !== "enabled");
  if (isAdminOrSuperAdmin) return list;
  const allowed = user?.whatsappAllowed;
  if (!Array.isArray(allowed) || allowed.length === 0) return list;
  const allowedIds = (allowed as { id: number }[]).map((a) => a.id);
  return list.filter((w) => allowedIds.includes(w.id));
}

/**
 * Conveniência: lê `user`/`supervisorAdmin` do auth-store (leitura não-reativa
 * via getState) e aplica {@link filterWhatsappsByUserAccess}. Chamável fora de
 * componentes React (ex.: dentro de callbacks de carregamento de conexões).
 */
export function filterWhatsappsForCurrentUser<T extends WhatsappIdLike>(list: T[]): T[] {
  const { user, supervisorAdmin } = useAuthStore.getState();
  return filterWhatsappsByUserAccess(list, user, supervisorAdmin);
}
