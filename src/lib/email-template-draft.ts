import type { EmailDesign } from "./email-design";

/**
 * Rascunho automático da página do modelo de e-mail (PLANO_EMAIL_EDITOR_VISUAL D17).
 *
 * O guard de alterações não salvas cobre links e fechar/recarregar a aba, mas não o
 * "voltar" do navegador/celular — o rascunho no navegador permite restaurar. Chave por
 * tenant + usuário + modelo; `clearAllEmailTemplateDrafts` roda no `clearAuth` (logout
 * explícito e forçado), para o próximo usuário do mesmo navegador não ver nada.
 * Anexos não entram (arquivos não cabem no localStorage). Toda operação é tolerante a
 * falha: sem armazenamento disponível, a página segue sem rascunho.
 */

const PREFIX = "emailTemplateDraft:";

export interface EmailTemplateDraft {
  v: 1;
  savedAt: string;
  /** `updatedAt` do modelo quando o rascunho começou (null = modelo novo) */
  baseUpdatedAt: string | null;
  name: string;
  subject: string;
  mode: "visual" | "classic";
  design: EmailDesign | null;
  html: string | null;
}

export function emailTemplateDraftKey(
  tenantId: number | string,
  userId: number | string,
  templateId: number | "novo"
): string {
  return `${PREFIX}${tenantId}:${userId}:${templateId}`;
}

export function saveEmailTemplateDraft(key: string, draft: EmailTemplateDraft): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function loadEmailTemplateDraft(key: string): EmailTemplateDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1 || (parsed.mode !== "visual" && parsed.mode !== "classic")) return null;
    return parsed as EmailTemplateDraft;
  } catch {
    return null;
  }
}

export function removeEmailTemplateDraft(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* sem armazenamento: nada a remover */
  }
}

export function clearAllEmailTemplateDrafts(): void {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(PREFIX)) keys.push(key);
    }
    keys.forEach(key => window.localStorage.removeItem(key));
  } catch {
    /* sem armazenamento: nada a limpar */
  }
}
