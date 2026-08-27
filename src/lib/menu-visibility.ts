// Grafias alternativas de chave de menuVisibility. Alguns itens têm 2 nomes: a
// sidebar e o config de tenant (tenants/page.tsx) usam kebab (facebook-comentarios,
// woocommerce); o editor de perfil custom + as páginas (usePageAccess) usam
// camelCase/-produtos (facebookComentarios, woocommerce-produtos). Fonte única
// compartilhada entre a sidebar (esconder item) e o guard de rotas (bloquear URL),
// para que o toggle do perfil custom afete os DOIS pontos sem migração de dados.
export const MENU_VISIBILITY_ALIASES: Record<string, string> = {
  "facebook-comentarios": "facebookComentarios",
  "instagram-comentarios": "instagramComentarios",
  "instagram-automacao": "instagramAutomacao",
  "tiktok-comentarios": "tiktokComentarios",
  "youtube-comentarios": "youtubeComentarios",
  "woocommerce": "woocommerce-produtos",
  "nuvemshop": "nuvemshop-produtos",
};

// Um item/rota está oculto se a chave OU o seu alias (2ª grafia) estiver marcado
// como false. Só oculta quando ALGUMA grafia é explicitamente false (intenção real
// de esconder) — nunca por ausência —, então é seguro para todos os perfis.
export function isMenuRouteHidden(
  menuVisibility: Record<string, boolean>,
  routeName: string,
): boolean {
  if (menuVisibility[routeName] === false) return true;
  const aliasKey = MENU_VISIBILITY_ALIASES[routeName];
  if (aliasKey && menuVisibility[aliasKey] === false) return true;
  return false;
}
