// Telas de comentários do Instagram e do Facebook: quem pode apagar e editar
// comentário, publicar, agendar, editar e apagar post e editar legenda. Supervisor e
// atendente com a permissão do menu só leem, respondem e criam comentário.
// Espelho de `backend/src/middleware/requireSocialPageManageZPRO.ts` (mudar um exige
// o outro). Superadmin não abre páginas de empresa, então não entra aqui.
export function canManageSocialPage(profile?: string | null): boolean {
  return profile === "admin" || profile === "custom";
}
